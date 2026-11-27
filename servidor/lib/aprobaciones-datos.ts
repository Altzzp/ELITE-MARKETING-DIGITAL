// Carga de datos de Aprobaciones con la sesión de la persona (RLS decide qué marcas y piezas ve; las marcas archivadas no se muestran).
import type { SupabaseClient } from '@supabase/supabase-js';
import { esUuid } from './usuarios.ts';
import { diaEnZona, zonaValida } from './panel.ts';
import { leerTarea, type Tarea } from './tablero.ts';
import { cargarMarcasActivas, nombresDe, type MarcaTablero } from './tablero-datos.ts';

export type Pendiente = { tarea: Tarea; marca: MarcaTablero; solicitadaEn: string | null; version: { numero: number; nota: string } | null; responsable: string | null };
export type Decidida = { tarea: Tarea; marca: MarcaTablero; resultado: 'aprobada' | 'cambios'; decididaEn: string; por: string | null; comentario: string | null };
export type DatosAprobaciones = { hoy: string; pendientes: Pendiente[]; decididas: Decidida[] };
export const MAX_PENDIENTES = 100, MAX_DECIDIDAS = 20;

type Resultado = { data: unknown; error: { code?: string } | null };
function filas(r: Resultado, que: string): Record<string, unknown>[] {
  if (r.error) throw new Error(`No se pudo cargar ${que} (${r.error.code ?? 'sin código'})`);   // solo el código: el mensaje puede traer datos
  return Array.isArray(r.data) ? r.data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');
const COLUMNAS = 'id,marca_id,titulo,formato,fecha_programada,estado,aprobacion,responsable_id,creada_en,publicada_en';

export async function cargarAprobaciones(sb: SupabaseClient, agenciaId: string, ahora = new Date()): Promise<DatosAprobaciones> {
  const [agencia, marcas] = await Promise.all([sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle(), cargarMarcasActivas(sb)]);
  if (agencia.error) throw new Error(`No se pudo cargar la agencia (${agencia.error.code ?? 'sin código'})`);
  const hoy = diaEnZona(ahora, zonaValida((agencia.data as { zona_horaria?: unknown } | null)?.zona_horaria));
  const activas = marcas.map((m) => m.id), marcaDe = (id: string) => marcas.find((m) => m.id === id);
  if (!activas.length) return { hoy, pendientes: [], decididas: [] };

  const [pend, rondasDecididas] = await Promise.all([
    sb.from('tareas').select(COLUMNAS).eq('estado', 'en_revision').eq('aprobacion', 'pendiente').in('marca_id', activas).order('fecha_programada', { ascending: true }).limit(MAX_PENDIENTES),
    sb.from('rondas_aprobacion').select('tarea_id,decidida_en,resultado,decidida_por').in('resultado', ['aprobada', 'cambios']).order('decidida_en', { ascending: false }).limit(MAX_DECIDIDAS * 3),
  ]);
  const tareasPend = filas(pend, 'las piezas').flatMap((f) => { const t = leerTarea(f); return t ? [t] : []; });
  const rondas = filas(rondasDecididas, 'las decisiones');

  // Piezas de las decisiones recientes (dos consultas en vez de una con relaciones: así funciona igual en cualquier entorno).
  const idsDec = [...new Set(rondas.map((r) => txt(r['tarea_id'])).filter(esUuid))];
  const tareasDec = idsDec.length ? filas(await sb.from('tareas').select(COLUMNAS).in('id', idsDec).in('marca_id', activas), 'las piezas decididas').flatMap((f) => { const t = leerTarea(f); return t ? [t] : []; }) : [];
  const porId = new Map(tareasDec.map((t) => [t.id, t] as const));
  const vistas = new Set<string>();
  const decididasBase = rondas.flatMap((r) => {   // una decisión por pieza (la más reciente), solo de piezas visibles y de marcas activas
    const t = porId.get(txt(r['tarea_id']).toLowerCase()), resultado = r['resultado'];
    if (!t || vistas.has(t.id) || (resultado !== 'aprobada' && resultado !== 'cambios')) return [];
    vistas.add(t.id); return [{ t, resultado: resultado as 'aprobada' | 'cambios', decididaEn: txt(r['decidida_en']), por: txt(r['decidida_por']) }];
  }).slice(0, MAX_DECIDIDAS);

  const idsPend = tareasPend.map((t) => t.id), idsCambios = decididasBase.filter((d) => d.resultado === 'cambios').map((d) => d.t.id);
  const [versiones, abiertas, cambios] = await Promise.all([
    idsPend.length ? sb.from('versiones').select('tarea_id,numero,nota').in('tarea_id', idsPend).order('numero', { ascending: false }).limit(1000) : { data: [], error: null },
    idsPend.length ? sb.from('rondas_aprobacion').select('tarea_id,solicitada_en').in('tarea_id', idsPend).order('solicitada_en', { ascending: false }).limit(1000) : { data: [], error: null },
    idsCambios.length ? sb.from('comentarios').select('tarea_id,texto,creado_en').in('tarea_id', idsCambios).eq('tipo', 'cambio').order('creado_en', { ascending: false }).limit(500) : { data: [], error: null },
  ]);
  const ultimaVersion = new Map<string, { numero: number; nota: string }>(), enviada = new Map<string, string>(), ultimoCambio = new Map<string, string>();
  for (const f of filas(versiones, 'las versiones')) if (!ultimaVersion.has(txt(f['tarea_id']))) ultimaVersion.set(txt(f['tarea_id']), { numero: Number(f['numero']) || 0, nota: txt(f['nota']) });
  for (const f of filas(abiertas, 'los envíos')) if (!enviada.has(txt(f['tarea_id']))) enviada.set(txt(f['tarea_id']), txt(f['solicitada_en']));
  for (const f of filas(cambios, 'los comentarios')) if (!ultimoCambio.has(txt(f['tarea_id']))) ultimoCambio.set(txt(f['tarea_id']), txt(f['texto']));

  const nombres = await nombresDe(sb, [...tareasPend.flatMap((t) => (t.responsableId ? [t.responsableId] : [])), ...decididasBase.map((d) => d.por)]);
  const pendientes = tareasPend.flatMap((t) => { const marca = marcaDe(t.marcaId); return marca ? [{ tarea: t, marca, solicitadaEn: enviada.get(t.id) ?? null, version: ultimaVersion.get(t.id) ?? null, responsable: t.responsableId ? nombres.get(t.responsableId) ?? null : null }] : []; });
  const decididas = decididasBase.flatMap((d) => { const marca = marcaDe(d.t.marcaId); return marca ? [{ tarea: d.t, marca, resultado: d.resultado, decididaEn: d.decididaEn, por: nombres.get(d.por) ?? null, comentario: ultimoCambio.get(d.t.id) ?? null }] : []; });
  return { hoy, pendientes, decididas };
}
