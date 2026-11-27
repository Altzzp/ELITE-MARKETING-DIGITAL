// Orquestador: valida, comprueba permisos y límite, llama al modelo y guarda el resultado. No conoce Supabase (usa Repositorio),
// así que se prueba sin red. La IA solo PROPONE: nunca crea tareas ni publica; eso lo hace una persona con las funciones SQL de 0003.
import { parsearSalida, type Parseado } from './parsear.ts';
import { construirSistema, type MarcaContexto } from './prompts.ts';
import { ErrorIA, MODOS, PROVEEDORES, type Adaptador, type Modo, type Proveedor, type SalidaModelo, type Turno } from './tipos.ts';
import { hoyEnZona, limpiarControl, obj, txt } from './util.ts';

export const MAX_TEXTO_ENTRADA = 4000, HISTORIAL_MAX = 10, TITULO_INICIAL = 'Conversación nueva';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MarcaConZona extends MarcaContexto { zona_horaria?: string | null }
export interface ConversacionFila { id: string; marca_id: string; titulo: string; proveedor: Proveedor }
export interface Intercambio { conversacionId: string; modo: Modo; textoUsuario: string; proveedor: Proveedor; salida: SalidaModelo; parseado: Parseado; titulo?: string }

/** Todo el acceso a datos que necesita la ruta. La implementación real usa el JWT de la persona, así que RLS decide qué ve. */
export interface Repositorio {
  conversacion(id: string): Promise<ConversacionFila | null>;
  marca(id: string): Promise<MarcaConZona | null>;
  historial(conversacionId: string, limite: number): Promise<Turno[]>;
  usoUltimas24h(): Promise<number>;
  registrarUso(u: { proveedor: Proveedor; modelo: string; tokensEntrada: number; tokensSalida: number }): Promise<void>;
  guardarIntercambio(x: Intercambio): Promise<{ id: string; creadoEn: string }>;
}
export interface Dependencias { repo: Repositorio; adaptadores: Partial<Record<Proveedor, Adaptador>>; limiteTokens24h: number; maxTokensSalida: number; tiempoMaxMs: number; ahora?: () => Date }
export interface RespuestaIA {
  mensaje: { id: string; texto: string; elementos: Parseado['elementos']; estructurado: boolean; proveedor: Proveedor; modelo: string; creadoEn: string };
  uso: { tokensEntrada: number; tokensSalida: number };
}

function validar(entrada: unknown): { conversacionId: string; texto: string; modo: Modo; proveedor?: Proveedor } {
  const e = obj(entrada), texto = txt(e.texto).trim(), conversacionId = txt(e.conversacion_id);
  if (!UUID.test(conversacionId)) throw new ErrorIA('datos_invalidos', 'Falta la conversación.');
  if (!texto) throw new ErrorIA('datos_invalidos', 'Escribe un mensaje.');
  if (texto.length > MAX_TEXTO_ENTRADA) throw new ErrorIA('datos_invalidos', `El mensaje es demasiado largo (máximo ${MAX_TEXTO_ENTRADA} caracteres).`);
  if (!(MODOS as readonly string[]).includes(txt(e.modo))) throw new ErrorIA('datos_invalidos', 'El modo no es válido.');
  if (e.proveedor !== undefined && !(PROVEEDORES as readonly string[]).includes(txt(e.proveedor))) throw new ErrorIA('datos_invalidos', 'El modelo no es válido.');
  return { conversacionId, texto, modo: e.modo as Modo, ...(e.proveedor !== undefined && { proveedor: e.proveedor as Proveedor }) };
}

export async function generarRespuesta(d: Dependencias, entrada: unknown): Promise<RespuestaIA> {
  const p = validar(entrada);
  const conv = await d.repo.conversacion(p.conversacionId);         // RLS: solo existe si es tuya y puedes ver la marca
  if (!conv) throw new ErrorIA('no_encontrada');
  const proveedor = p.proveedor ?? conv.proveedor;
  const adaptador = d.adaptadores[proveedor];
  if (!adaptador) throw new ErrorIA('proveedor_no_configurado');   // nunca se simula una respuesta
  if ((await d.repo.usoUltimas24h()) >= d.limiteTokens24h) throw new ErrorIA('limite_uso');
  const marca = await d.repo.marca(conv.marca_id);
  if (!marca) throw new ErrorIA('no_encontrada');

  const hoy = hoyEnZona(marca.zona_horaria, (d.ahora ?? (() => new Date()))());
  const previo = await d.repo.historial(conv.id, HISTORIAL_MAX);
  const salida = await adaptador.generar(
    { sistema: construirSistema(marca, p.modo, hoy), historial: [...previo, { rol: 'usuario', texto: p.texto }], maxTokensSalida: d.maxTokensSalida },
    AbortSignal.timeout(d.tiempoMaxMs),
  );

  // El consumo se registra antes de guardar los mensajes: si el guardado falla, el gasto igual cuenta para el límite.
  await d.repo.registrarUso({ proveedor, modelo: salida.modelo, tokensEntrada: salida.tokensEntrada, tokensSalida: salida.tokensSalida })
    .catch((e: unknown) => console.error('[ia] no se pudo registrar el uso:', e instanceof Error ? e.message : e));

  const parseado = parsearSalida(salida.texto, hoy);
  const titulo = conv.titulo === TITULO_INICIAL ? limpiarControl(p.texto, 60).replace(/\s+/g, ' ').trim() : undefined;
  let guardado: { id: string; creadoEn: string };
  try {
    guardado = await d.repo.guardarIntercambio({ conversacionId: conv.id, modo: p.modo, textoUsuario: p.texto, proveedor, salida, parseado, ...(titulo && { titulo }) });
  } catch (e) {
    console.error('[ia] no se pudo guardar el intercambio:', e instanceof Error ? e.message : e);
    throw new ErrorIA('error_interno');
  }
  return {
    mensaje: { id: guardado.id, texto: parseado.texto, elementos: parseado.elementos, estructurado: parseado.estructurado, proveedor, modelo: salida.modelo, creadoEn: guardado.creadoEn },
    uso: { tokensEntrada: salida.tokensEntrada, tokensSalida: salida.tokensSalida },
  };
}
