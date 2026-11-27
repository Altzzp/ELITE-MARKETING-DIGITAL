// Carga de datos del Panel. Todo se lee con la sesión de la persona: las políticas RLS de la base deciden qué marcas y piezas ve
// (Administrador y Dirección todas; Community Manager y Cliente las asignadas; Diseñador solo las piezas que tiene a su cargo).
import type { SupabaseClient } from '@supabase/supabase-js';
import { esUuid } from './usuarios.ts';
import {
  aTiempo, conteoPorEstado, diaEnZona, esEstadoTarea, estaAtrasada, leerMetrica, sumarMetricas, zonaValida,
  type EstadoTarea, type Formato, type Metrica, type Totales,
} from './panel.ts';

export type Marca = { id: string; nombre: string; corto: string };
export type Pieza = { id: string; marcaId: string; titulo: string; formato: string; fecha: string; estado: EstadoTarea };
export type Pendiente = Pieza & { atrasada: boolean; responsable: string | null };
export type Realizada = Pieza & { publicadaEn: string; aTiempo: boolean };
export type Subida = { tareaId: string; numero: number; titulo: string; marcaId: string; formato: string; autor: string | null; creadoEn: string };

export type DatosPanel = {
  zona: string; hoy: string;
  marcas: Marca[]; marcaElegida: string | null;
  metricas: Metrica[]; totales: Totales; porEstado: Record<EstadoTarea, number>;
  pendientes: Pendiente[]; realizadas: Realizada[]; subidas: Subida[];
};

export const FILAS_POR_LISTA = 6;

type Resultado = { data: unknown; error: { code?: string } | null };
function filas(r: Resultado, que: string): Record<string, unknown>[] {
  if (r.error) throw new Error(`No se pudo cargar ${que} (${r.error.code ?? 'sin código'})`);   // solo el código: el mensaje puede traer datos
  return Array.isArray(r.data) ? r.data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');

function leerPieza(f: Record<string, unknown>): Pieza | null {
  const id = txt(f['id']), marcaId = txt(f['marca_id']);
  if (!id || !marcaId || !esEstadoTarea(f['estado'])) return null;
  return { id, marcaId, titulo: txt(f['titulo']), formato: txt(f['formato']), fecha: txt(f['fecha_programada']), estado: f['estado'] };
}

/** `marcaPedida` viene de la dirección (texto libre): solo se acepta si es una marca que la persona realmente ve. */
export async function cargarPanel(sb: SupabaseClient, agenciaId: string, marcaPedida: string, ahora = new Date()): Promise<DatosPanel> {
  const [agencia, listaMarcas] = await Promise.all([
    sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle(),
    sb.from('marcas').select('id,nombre,nombre_corto,activa').order('nombre', { ascending: true }).limit(500),
  ]);
  if (agencia.error) throw new Error(`No se pudo cargar la agencia (${agencia.error.code ?? 'sin código'})`);
  const zona = zonaValida((agencia.data as { zona_horaria?: unknown } | null)?.zona_horaria);
  // Las marcas archivadas no cuentan en el Panel (su historial sigue en Reportes): ni en la lista, ni en las cifras, ni en las actividades.
  const marcas: Marca[] = filas(listaMarcas, 'las marcas').filter((f) => f['activa'] !== false).map((f) => ({ id: txt(f['id']), nombre: txt(f['nombre']), corto: txt(f['nombre_corto']) || txt(f['nombre']) })).filter((m) => m.id !== '');
  const marcaElegida = esUuid(marcaPedida) && marcas.some((m) => m.id === marcaPedida.toLowerCase()) ? marcaPedida.toLowerCase() : null;
  const argMarca = marcaElegida ? { p_marca: marcaElegida } : {};

  let pend = sb.from('tareas').select('id,marca_id,titulo,formato,fecha_programada,estado,responsable_id').neq('estado', 'publicado');
  let real = sb.from('tareas').select('id,marca_id,titulo,formato,fecha_programada,estado,publicada_en').eq('estado', 'publicado');
  const activas = marcas.map((x) => x.id);
  if (marcaElegida) { pend = pend.eq('marca_id', marcaElegida); real = real.eq('marca_id', marcaElegida); }
  else { pend = pend.in('marca_id', activas); real = real.in('marca_id', activas); }
  const sinMarcas: Resultado = { data: [], error: null };   // sin marcas activas no hay nada que listar (y `in ()` vacío no merece un viaje)
  const [m, e, p, r, v] = await Promise.all([
    sb.rpc('metricas', argMarca),
    sb.rpc('tareas_por_estado', argMarca),
    activas.length ? pend.order('fecha_programada', { ascending: true }).order('creada_en', { ascending: true }).limit(FILAS_POR_LISTA) : sinMarcas,
    activas.length ? real.order('publicada_en', { ascending: false }).limit(FILAS_POR_LISTA) : sinMarcas,
    sb.rpc('versiones_recientes', { ...argMarca, p_limite: FILAS_POR_LISTA }),
  ]);

  const activasSet = new Set(activas);
  const metricas = filas(m, 'los indicadores').map(leerMetrica).filter((x): x is Metrica => x !== null && activasSet.has(x.marcaId));
  const filasPend = filas(p, 'las actividades pendientes');
  const idsResponsables = [...new Set(filasPend.map((f) => txt(f['responsable_id'])).filter(esUuid))];
  const nombres = new Map<string, string>();
  if (idsResponsables.length) for (const f of filas(await sb.from('perfiles').select('id,nombre').in('id', idsResponsables), 'los responsables')) nombres.set(txt(f['id']), txt(f['nombre']));

  const hoy = diaEnZona(ahora, zona);
  const pendientes: Pendiente[] = filasPend.flatMap((f) => { const x = leerPieza(f); return x ? [{ ...x, atrasada: estaAtrasada(x.fecha, x.estado, hoy), responsable: nombres.get(txt(f['responsable_id'])) ?? null }] : []; });
  const realizadas: Realizada[] = filas(r, 'las actividades realizadas').flatMap((f) => {
    const x = leerPieza(f), publicadaEn = txt(f['publicada_en']);
    return x && publicadaEn ? [{ ...x, publicadaEn, aTiempo: aTiempo(publicadaEn, x.fecha, zona) }] : [];
  });
  const subidas: Subida[] = filas(v, 'el contenido subido').flatMap((f) => {
    const numero = Number(f['numero']);
    return txt(f['tarea_id']) && Number.isFinite(numero) ? [{ tareaId: txt(f['tarea_id']), numero, titulo: txt(f['titulo']), marcaId: txt(f['marca_id']), formato: txt(f['formato']) as Formato, autor: txt(f['autor']) || null, creadoEn: txt(f['creado_en']) }] : [];
  });

  return { zona, hoy, marcas, marcaElegida, metricas, totales: sumarMetricas(metricas), porEstado: conteoPorEstado(filas(e, 'las actividades por estado')), pendientes, realizadas, subidas };
}
