// Chat de IA: reglas puras y carga de datos. Las conversaciones son privadas de cada persona (RLS) y solo las usan los roles con el chat.
import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarMarcasActivas, type MarcaTablero } from './tablero-datos.ts';
import { FORMATOS } from './panel.ts';
import { esUuid } from './usuarios.ts';

export const PROVEEDORES = [{ id: 'claude', texto: 'Claude' }, { id: 'chatgpt', texto: 'ChatGPT' }, { id: 'gemini', texto: 'Gemini' }] as const;
export type ProveedorId = (typeof PROVEEDORES)[number]['id'];
export const esProveedor = (x: unknown): x is ProveedorId => PROVEEDORES.some((p) => p.id === x);
export const etiquetaProveedor = (x: unknown): string => PROVEEDORES.find((p) => p.id === x)?.texto ?? '—';

export const MODOS = [
  { id: 'ideas', texto: 'Ideas de contenido' }, { id: 'copies', texto: 'Copies' }, { id: 'guiones', texto: 'Guiones' }, { id: 'campanas', texto: 'Campañas' },
  { id: 'calendario', texto: 'Calendario de contenido' }, { id: 'analizar_marca', texto: 'Analizar la marca' }, { id: 'tarea_desde_idea', texto: 'Idea lista para producir' },
] as const;
export type ModoId = (typeof MODOS)[number]['id'];
export const esModo = (x: unknown): x is ModoId => MODOS.some((m) => m.id === x);
export const etiquetaModo = (x: unknown): string => MODOS.find((m) => m.id === x)?.texto ?? '—';

export const LIMITE_TEXTO = 4000;   // lo que aguanta la ruta de IA por mensaje (generar.ts valida el máximo real)
export const puedeUsarChat = (rol: string): boolean => rol === 'administrador' || rol === 'direccion' || rol === 'community_manager';

export const AVISOS_CHAT: Record<string, { tipo: 'ok' | 'error'; texto: string }> = {
  'idea-guardada': { tipo: 'ok', texto: 'La propuesta se guardó en el banco de Ideas.' },
  marca: { tipo: 'error', texto: 'Elige la marca sobre la que quieres trabajar.' },
  datos: { tipo: 'error', texto: 'No pudimos entender el envío. Inténtalo de nuevo.' },
  'sin-permiso': { tipo: 'error', texto: 'Tu rol no puede usar el chat de IA.' },
  'no-encontrada': { tipo: 'error', texto: 'No encontramos esa conversación o propuesta.' },
  'marca-archivada': { tipo: 'error', texto: 'La marca está archivada: restáurala para usar el chat con ella.' },
  generico: { tipo: 'error', texto: 'No se pudo completar la acción. Inténtalo de nuevo; si sigue igual, avisa a soporte.' },
};
export function codigoDeErrorChat(error: { code?: string; message?: string }): string {
  if (error.code === '42501') return 'sin-permiso';
  if (error.code === 'P0002') return /marca/i.test(error.message ?? '') ? 'marca' : 'no-encontrada';
  if (/archivada/i.test(error.message ?? '')) return 'marca-archivada';
  return 'generico';
}
export function destinoChat(conversacion?: string, aviso?: string): string {
  const q = new URLSearchParams();
  if (conversacion && esUuid(conversacion)) q.set('c', conversacion);
  if (aviso && Object.hasOwn(AVISOS_CHAT, aviso)) q.set(AVISOS_CHAT[aviso]!.tipo === 'error' ? 'e' : 'a', aviso);
  const s = q.toString();
  return s ? `/chat?${s}` : '/chat';
}

export type Elemento = { titulo: string; cuerpo: string; formato: string; fecha: string | null };
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');
export function leerElementos(x: unknown): Elemento[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((e) => {
    if (typeof e !== 'object' || e === null) return [];
    const o = e as Record<string, unknown>;
    return txt(o['titulo']).trim() ? [{ titulo: txt(o['titulo']), cuerpo: txt(o['cuerpo']), formato: (FORMATOS as readonly string[]).includes(txt(o['formato'])) ? txt(o['formato']) : 'post', fecha: /^\d{4}-\d{2}-\d{2}$/.test(txt(o['fecha'])) ? txt(o['fecha']) : null }] : [];
  });
}

export type Conversacion = { id: string; marcaId: string; titulo: string; proveedor: string; modo: string; actualizadaEn: string };
export type Mensaje = { id: string; rol: 'usuario' | 'asistente'; modo: string; texto: string; elementos: Elemento[]; proveedor: string; modelo: string; creadoEn: string };
export type DatosChat = { marcas: MarcaTablero[]; conversaciones: Conversacion[]; actual: Conversacion | null; mensajes: Mensaje[] };

type Resultado = { data: unknown; error: { code?: string } | null };
const filas = (r: Resultado, que: string): Record<string, unknown>[] => {
  if (r.error) throw new Error(`No se pudo cargar ${que} (${r.error.code ?? 'sin código'})`);   // solo el código: el mensaje puede traer datos
  return Array.isArray(r.data) ? r.data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
};
const leerConversacion = (f: Record<string, unknown>): Conversacion | null => (esUuid(txt(f['id'])) ? { id: txt(f['id']), marcaId: txt(f['marca_id']), titulo: txt(f['titulo']), proveedor: txt(f['proveedor']), modo: txt(f['modo']), actualizadaEn: txt(f['actualizada_en']) } : null);

export async function cargarChat(sb: SupabaseClient, pedida: string): Promise<DatosChat> {
  const [marcas, lista] = await Promise.all([
    cargarMarcasActivas(sb),
    sb.from('conversaciones_ia').select('id,marca_id,titulo,proveedor,modo,actualizada_en').order('actualizada_en', { ascending: false }).limit(30),
  ]);
  const conversaciones = filas(lista, 'las conversaciones').flatMap((f) => { const c = leerConversacion(f); return c ? [c] : []; });
  let actual = esUuid(pedida) ? conversaciones.find((c) => c.id === pedida) ?? null : null;
  if (!actual && esUuid(pedida)) { const f = filas(await sb.from('conversaciones_ia').select('id,marca_id,titulo,proveedor,modo,actualizada_en').eq('id', pedida).limit(1), 'la conversación')[0]; actual = f ? leerConversacion(f) : null; }
  let mensajes: Mensaje[] = [];
  if (actual) {
    mensajes = filas(await sb.from('mensajes_ia').select('id,rol,modo,texto,elementos,proveedor,modelo,creado_en').eq('conversacion_id', actual.id).order('orden', { ascending: true }).limit(200), 'los mensajes')
      .flatMap((f) => (esUuid(txt(f['id'])) && (f['rol'] === 'usuario' || f['rol'] === 'asistente') ? [{ id: txt(f['id']), rol: f['rol'] as 'usuario' | 'asistente', modo: txt(f['modo']), texto: txt(f['texto']), elementos: leerElementos(f['elementos']), proveedor: txt(f['proveedor']), modelo: txt(f['modelo']), creadoEn: txt(f['creado_en']) }] : []));
  }
  return { marcas, conversaciones, actual, mensajes };
}
