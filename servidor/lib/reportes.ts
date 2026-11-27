// Reportes: lectura segura de metricas() y de las publicaciones, y formato de los números. Sin importaciones de Next (se prueba con node --test).
import type { SupabaseClient } from '@supabase/supabase-js';
import { zonaValida } from './panel.ts';
import { esUuid } from './usuarios.ts';

export const PERIODOS = [
  { id: '30', texto: 'Últimos 30 días', dias: 30 },
  { id: '90', texto: 'Últimos 90 días', dias: 90 },
  { id: '365', texto: 'Último año', dias: 365 },
  { id: 'todo', texto: 'Todo el historial', dias: null },
] as const;
export type PeriodoId = (typeof PERIODOS)[number]['id'];
export const periodoValido = (x: unknown): PeriodoId => (PERIODOS.find((p) => p.id === x)?.id ?? '30');
/** Instante (ISO) desde el que se cuenta, o null para todo el historial. */
export function desdeDe(periodo: PeriodoId, ahora: Date): string | null {
  const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? null;
  return dias === null ? null : new Date(ahora.getTime() - dias * 864e5).toISOString();
}

const num = (x: unknown): number | null => { const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x; return typeof n === 'number' && Number.isFinite(n) ? n : null; };

/** Horas que dura un intervalo de PostgreSQL ("1 day 02:30:00", "00:45:10") o su forma de objeto; null si no se entiende. */
export function duracionEnHoras(x: unknown): number | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const h = (num(o['days']) ?? 0) * 24 + (num(o['hours']) ?? 0) + (num(o['minutes']) ?? 0) / 60 + (num(o['seconds']) ?? 0) / 3600;
    return Number.isFinite(h) && Object.keys(o).length > 0 ? h : null;
  }
  if (typeof x !== 'string') return null;
  const m = /^\s*(?:(-?\d+)\s+days?\s*)?(?:(-?\d+):(\d{2}):(\d{2}(?:\.\d+)?))?\s*$/.exec(x);
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const neg = m[2]?.startsWith('-') ? -1 : 1;
  return Number(m[1] ?? 0) * 24 + (m[2] ? Math.abs(Number(m[2])) * neg + Number(m[3]) / 60 * neg + Number(m[4]) / 3600 * neg : 0);
}
export function formatoDuracion(horas: number | null): string {
  if (horas === null || horas < 0) return '—';
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${Math.round(horas * 10) / 10} h`;
  return `${Math.round(horas / 24 * 10) / 10} días`;
}

export type FilaReporte = {
  marcaId: string; total: number; publicadas: number; pendientes: number; atrasadas: number;
  cumplimiento: number | null; espera: number | null; rondas: number; versiones: number | null;
};
export function leerFilaReporte(x: unknown): FilaReporte | null {
  if (typeof x !== 'object' || x === null) return null;
  const f = x as Record<string, unknown>;
  const marcaId = typeof f['marca_id'] === 'string' ? f['marca_id'] : '';
  const total = num(f['total']), publicadas = num(f['publicadas']), pendientes = num(f['pendientes']), atrasadas = num(f['atrasadas']), rondas = num(f['rondas_decididas']);
  if (!esUuid(marcaId) || total === null || publicadas === null || pendientes === null || atrasadas === null) return null;
  return { marcaId, total, publicadas, pendientes, atrasadas, cumplimiento: num(f['cumplimiento']), espera: duracionEnHoras(f['aprobacion_promedio']), rondas: rondas ?? 0, versiones: num(f['versiones_promedio']) };
}
export type TotalesReporte = { total: number; publicadas: number; pendientes: number; atrasadas: number };
export const sumarFilas = (filas: readonly FilaReporte[]): TotalesReporte => filas.reduce((t, f) => ({ total: t.total + f.total, publicadas: t.publicadas + f.publicadas, pendientes: t.pendientes + f.pendientes, atrasadas: t.atrasadas + f.atrasadas }), { total: 0, publicadas: 0, pendientes: 0, atrasadas: 0 });

/** Publicaciones por canal, de más a menos (empates por nombre). */
export function contarPorCanal(canales: readonly string[]): { canal: string; total: number }[] {
  const m = new Map<string, number>();
  for (const c of canales) { const k = c.trim(); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].map(([canal, total]) => ({ canal, total })).sort((a, b) => b.total - a.total || a.canal.localeCompare(b.canal, 'es'));
}

export type MarcaReporte = { id: string; nombre: string; activa: boolean };
export type DatosReporte = { zona: string; periodo: PeriodoId; marcas: MarcaReporte[]; filas: FilaReporte[]; canales: { canal: string; total: number }[]; publicaciones: number; generado: string };
export const MAX_PUBLICACIONES = 5000;

type Resultado = { data: unknown; error: { code?: string } | null };
const filas = (r: Resultado, que: string): unknown[] => { if (r.error) throw new Error(`No se pudo cargar ${que} (${r.error.code ?? 'sin código'})`); return Array.isArray(r.data) ? r.data : []; };

export async function cargarReporte(sb: SupabaseClient, agenciaId: string, periodo: PeriodoId, marcaPedida: string, ahora = new Date()): Promise<DatosReporte> {
  const [agencia, lista] = await Promise.all([sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle(), sb.from('marcas').select('id,nombre,activa').order('nombre', { ascending: true }).limit(500)]);
  if (agencia.error) throw new Error(`No se pudo cargar la agencia (${agencia.error.code ?? 'sin código'})`);
  const marcas: MarcaReporte[] = filas(lista, 'las marcas').flatMap((x) => { const f = x as Record<string, unknown>; return esUuid(f['id']) ? [{ id: String(f['id']), nombre: String(f['nombre'] ?? ''), activa: f['activa'] !== false }] : []; });
  const elegida = esUuid(marcaPedida) && marcas.some((m) => m.id === marcaPedida) ? marcaPedida : '';
  const desde = desdeDe(periodo, ahora);
  const arg = { ...(desde ? { p_desde: desde } : {}), ...(elegida ? { p_marca: elegida } : {}) };
  let pubs = sb.from('publicaciones').select('canal,marca_id,publicada_en');
  if (desde) pubs = pubs.gte('publicada_en', desde);
  if (elegida) pubs = pubs.eq('marca_id', elegida);
  const [m, p] = await Promise.all([sb.rpc('metricas', arg), pubs.order('publicada_en', { ascending: false }).limit(MAX_PUBLICACIONES)]);
  const conocidas = new Set(marcas.map((x) => x.id));
  const fs = filas(m, 'los indicadores').map(leerFilaReporte).filter((x): x is FilaReporte => x !== null && conocidas.has(x.marcaId));
  const ps = filas(p, 'las publicaciones').map((x) => String((x as Record<string, unknown>)['canal'] ?? ''));
  return { zona: zonaValida((agencia.data as { zona_horaria?: unknown } | null)?.zona_horaria), periodo, marcas, filas: fs, canales: contarPorCanal(ps), publicaciones: ps.length, generado: ahora.toISOString() };
}
