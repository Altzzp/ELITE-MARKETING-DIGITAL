// Adaptadores de Claude, ChatGPT y Gemini mediante sus APIs REST, sin SDK (menos dependencias, mismo contrato para los tres).
// Las claves llegan por variables de entorno del SERVIDOR; nunca se envían al navegador ni se escriben en mensajes de error.
// Un proveedor solo queda activo si tiene clave Y modelo configurados: los identificadores de modelo cambian y no se fijan aquí.
// Las peticiones siguen la documentación pública de cada proveedor; NO se han probado contra los servicios reales (ver LEEME).
import { ErrorIA, type Adaptador, type PeticionModelo, type Proveedor, type SalidaModelo, type Turno } from './tipos.ts';
import { arr, estimarTokens, num, obj, txt } from './util.ts';

type Entorno = Readonly<Record<string, string | undefined>>;
type Fetch = typeof fetch;

/** Debe empezar con la persona y alternar roles: junta turnos seguidos del mismo rol y descarta los vacíos. */
export function normalizarHistorial(historial: readonly Turno[]): Turno[] {
  const r: Turno[] = [];
  for (const t of historial) {
    const texto = t.texto.trim();
    if (!texto) continue;
    const ultimo = r[r.length - 1];
    if (ultimo && ultimo.rol === t.rol) ultimo.texto += `\n\n${texto}`;
    else if (!ultimo && t.rol === 'asistente') continue;
    else r.push({ rol: t.rol, texto });
  }
  return r;
}

const enmascarar = (t: string, secreto: string): string =>
  (secreto ? t.split(secreto).join('[clave]') : t).replace(/\b(?:sk-|AIza)\S*/g, '[clave]').slice(0, 300);
const registrar = (...a: unknown[]): void => console.error('[ia]', ...a);   // solo estado y texto enmascarado; nunca el mensaje de la persona

async function postJson(prov: Proveedor, url: string, cabeceras: Record<string, string>, cuerpo: unknown, senal: AbortSignal, f: Fetch, secreto: string): Promise<Record<string, unknown>> {
  let r: Response;
  try {
    r = await f(url, { method: 'POST', headers: { 'content-type': 'application/json', ...cabeceras }, body: JSON.stringify(cuerpo), signal: senal });
  } catch (e) {
    const nombre = e instanceof Error ? e.name : '';
    if (senal.aborted || nombre === 'AbortError' || nombre === 'TimeoutError') throw new ErrorIA('tiempo_agotado');
    registrar(prov, 'red', enmascarar(e instanceof Error ? e.message : String(e), secreto));
    throw new ErrorIA('proveedor_saturado');
  }
  if (!r.ok) {
    registrar(prov, r.status, enmascarar(await r.text().catch(() => ''), secreto));   // el detalle queda solo en el registro del servidor
    throw new ErrorIA(r.status === 429 || r.status >= 500 ? 'proveedor_saturado' : 'proveedor_rechazo');
  }
  try {
    const j: unknown = await r.json();
    if (j && typeof j === 'object') return j as Record<string, unknown>;
  } catch { /* cae al error de respuesta vacía */ }
  throw new ErrorIA('respuesta_vacia');
}

const entradaEstimada = (p: PeticionModelo): number => estimarTokens(p.sistema + p.historial.map((t) => t.texto).join(''));

function claude(clave: string, modelo: string, f: Fetch): Adaptador {
  return {
    proveedor: 'claude', modelo,
    async generar(p, senal): Promise<SalidaModelo> {
      const j = await postJson('claude', 'https://api.anthropic.com/v1/messages', { 'x-api-key': clave, 'anthropic-version': '2023-06-01' }, {
        model: modelo, max_tokens: p.maxTokensSalida, system: p.sistema,
        messages: normalizarHistorial(p.historial).map((t) => ({ role: t.rol === 'usuario' ? 'user' : 'assistant', content: t.texto })),
      }, senal, f, clave);
      const texto = arr(j.content).map(obj).filter((c) => c.type === 'text').map((c) => txt(c.text)).join('').trim();
      if (!texto) throw new ErrorIA('respuesta_vacia');
      const u = obj(j.usage);
      return { texto, modelo: txt(j.model) || modelo, tokensEntrada: num(u.input_tokens) ?? entradaEstimada(p), tokensSalida: num(u.output_tokens) ?? estimarTokens(texto) };
    },
  };
}

function chatgpt(clave: string, modelo: string, f: Fetch): Adaptador {
  return {
    proveedor: 'chatgpt', modelo,
    async generar(p, senal): Promise<SalidaModelo> {
      const j = await postJson('chatgpt', 'https://api.openai.com/v1/chat/completions', { authorization: `Bearer ${clave}` }, {
        model: modelo, max_completion_tokens: p.maxTokensSalida, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: p.sistema }, ...normalizarHistorial(p.historial).map((t) => ({ role: t.rol === 'usuario' ? 'user' : 'assistant', content: t.texto }))],
      }, senal, f, clave);
      const texto = txt(obj(obj(arr(j.choices)[0]).message).content).trim();
      if (!texto) throw new ErrorIA('respuesta_vacia');
      const u = obj(j.usage);
      return { texto, modelo: txt(j.model) || modelo, tokensEntrada: num(u.prompt_tokens) ?? entradaEstimada(p), tokensSalida: num(u.completion_tokens) ?? estimarTokens(texto) };
    },
  };
}

function gemini(clave: string, modeloCfg: string, f: Fetch): Adaptador {
  const modelo = modeloCfg.replace(/^models\//, '');
  return {
    proveedor: 'gemini', modelo,
    async generar(p, senal): Promise<SalidaModelo> {
      const j = await postJson('gemini', `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`, { 'x-goog-api-key': clave }, {
        systemInstruction: { parts: [{ text: p.sistema }] },
        contents: normalizarHistorial(p.historial).map((t) => ({ role: t.rol === 'usuario' ? 'user' : 'model', parts: [{ text: t.texto }] })),
        generationConfig: { maxOutputTokens: p.maxTokensSalida, responseMimeType: 'application/json' },
      }, senal, f, clave);
      const texto = arr(obj(obj(arr(j.candidates)[0]).content).parts).map((x) => txt(obj(x).text)).join('').trim();
      if (!texto) throw new ErrorIA('respuesta_vacia');
      const u = obj(j.usageMetadata);
      const salida = num(u.candidatesTokenCount) !== undefined ? (num(u.candidatesTokenCount) ?? 0) + (num(u.thoughtsTokenCount) ?? 0) : undefined;   // el razonamiento interno también se factura
      return { texto, modelo: txt(j.modelVersion) || modelo, tokensEntrada: num(u.promptTokenCount) ?? entradaEstimada(p), tokensSalida: salida ?? estimarTokens(texto) };
    },
  };
}

export function crearAdaptadores(env: Entorno, f: Fetch = fetch): Partial<Record<Proveedor, Adaptador>> {
  const cred = (k: string, m: string) => { const clave = env[k]?.trim(), modelo = env[m]?.trim(); return clave && modelo ? { clave, modelo } : null; };
  const a = cred('ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'), o = cred('OPENAI_API_KEY', 'OPENAI_MODEL'), g = cred('GEMINI_API_KEY', 'GEMINI_MODEL');
  return { ...(a && { claude: claude(a.clave, a.modelo, f) }), ...(o && { chatgpt: chatgpt(o.clave, o.modelo, f) }), ...(g && { gemini: gemini(g.clave, g.modelo, f) }) };
}
