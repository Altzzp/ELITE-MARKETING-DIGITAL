// Ruta de IA para Next.js (App Router): POST /api/ia genera una respuesta; GET /api/ia dice qué modelos están conectados.
// Autenticación (dos formas):
//   · Desde las pantallas de la aplicación: la sesión viaja en cookies HttpOnly (el navegador no puede leer el token). Como las cookies se envían
//     solas, el POST exige que venga del propio sitio (cabecera Origin = APP_URL) y con content-type application/json.
//   · Otros clientes: "Authorization: Bearer <access token de Supabase>" (no usa cookies, así que no hay CSRF).
// Se usa la clave ANON con la sesión de la persona: RLS aplica igual que en el resto de la aplicación. La clave service_role NO se usa aquí.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generarRespuesta } from '../../../ia/generar.ts';
import { crearAdaptadores } from '../../../ia/proveedores.ts';
import { repositorioSupabase } from '../../../ia/repositorio.ts';
import { ErrorIA, PROVEEDORES } from '../../../ia/tipos.ts';
import { esClaveDeServicio } from '../../../lib/claves.ts';   // Next no permite exportar funciones extra desde route.ts
import { urlApp } from '../../../lib/web.ts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_CUERPO = 16_000;
const CABECERAS = { 'cache-control': 'no-store' };

const entero = (v: string | undefined, porDefecto: number, min: number, max: number): number => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : porDefecto;
};

/** Un envío con cookies solo se acepta si lo hizo la propia aplicación (protección CSRF). Los navegadores siempre mandan Origin en un POST. */
function vieneDeLaAplicacion(req: Request): boolean {
  if (!/^application\/json(;|$)/i.test(req.headers.get('content-type') ?? '')) return false;   // un formulario de otro sitio no puede enviar este tipo sin permiso (CORS)
  const sitio = req.headers.get('sec-fetch-site');
  if (sitio && sitio !== 'same-origin') return false;
  try { return req.headers.get('origin') === urlApp(); } catch { return false; }
}

async function sesion(req: Request, modifica: boolean): Promise<SupabaseClient> {
  const jwt = /^Bearer\s+([\w.~+/-]+=*)$/i.exec(req.headers.get('authorization') ?? '')?.[1];
  if (!jwt) {
    if (!req.headers.get('cookie')) throw new ErrorIA('sin_sesion');
    if (modifica && !vieneDeLaAplicacion(req)) throw new ErrorIA('origen_no_permitido');
    const { clienteServidor } = await import('../../../lib/supabase.ts');   // solo en esta vía: así la ruta sigue pudiéndose probar sin Next
    const sb = await clienteServidor();
    const { data, error } = await sb.auth.getUser();
    if (error || !data.user) throw new ErrorIA('sin_sesion');
    return sb;
  }
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) { console.error('[ia] faltan SUPABASE_URL o SUPABASE_ANON_KEY'); throw new ErrorIA('error_interno'); }
  if (esClaveDeServicio(anon)) { console.error('[ia] SUPABASE_ANON_KEY contiene una clave de servicio: se rechaza'); throw new ErrorIA('error_interno'); }
  const bd = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await bd.auth.getUser(jwt);
  if (error || !data.user) throw new ErrorIA('sin_sesion');
  return bd;
}

function fallo(e: unknown): Response {
  const err = e instanceof ErrorIA ? e : (console.error('[ia] error inesperado:', e instanceof Error ? e.message : e), new ErrorIA('error_interno'));
  return Response.json({ ok: false, codigo: err.codigo, mensaje: err.message }, { status: err.estado, headers: CABECERAS });
}

export async function GET(req: Request): Promise<Response> {
  try {
    await sesion(req, false);
    const a = crearAdaptadores(process.env);
    return Response.json({ ok: true, proveedores: Object.fromEntries(PROVEEDORES.map((p) => [p, Boolean(a[p])])) }, { headers: CABECERAS });
  } catch (e) {
    return fallo(e);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    if (Number(req.headers.get('content-length') ?? 0) > MAX_CUERPO) throw new ErrorIA('datos_invalidos', 'La solicitud es demasiado grande.');
    const bd = await sesion(req, true);
    const crudo = await req.text();
    if (crudo.length > MAX_CUERPO) throw new ErrorIA('datos_invalidos', 'La solicitud es demasiado grande.');
    let cuerpo: unknown;
    try { cuerpo = JSON.parse(crudo); } catch { throw new ErrorIA('datos_invalidos', 'El cuerpo debe ser JSON.'); }
    const r = await generarRespuesta({
      repo: repositorioSupabase(bd),
      adaptadores: crearAdaptadores(process.env),
      limiteTokens24h: entero(process.env.IA_LIMITE_TOKENS_24H, 150_000, 1_000, 100_000_000),
      maxTokensSalida: entero(process.env.IA_MAX_TOKENS_SALIDA, 2048, 256, 16_000),
      tiempoMaxMs: 45_000,
    }, cuerpo);
    return Response.json({ ok: true, ...r }, { headers: CABECERAS });
  } catch (e) {
    return fallo(e);
  }
}
