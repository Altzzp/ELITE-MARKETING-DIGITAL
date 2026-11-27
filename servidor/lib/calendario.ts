// Calendario: reglas puras del mes y carga de las piezas que caen en él. Se lee con la sesión de la persona (RLS decide qué marcas y piezas ve).
import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarMarcasActivas, type MarcaTablero } from './tablero-datos.ts';
import { diaEnZona, zonaValida } from './panel.ts';
import { leerTarea, type Tarea } from './tablero.ts';
import { esUuid } from './usuarios.ts';

export const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const;
export const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

/** «AAAA-MM» si es un mes real entre 2020 y 2100; si no, null. */
export function mesValido(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(x);
  return m && Number(m[1]) >= 2020 && Number(m[1]) <= 2100 ? x : null;
}
export function moverMes(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export const tituloMes = (mes: string): string => { const [a, m] = mes.split('-').map(Number) as [number, number]; return `${NOMBRES_MES[m - 1]} ${a}`; };

export type Celda = { dia: string; delMes: boolean };
/** Semanas completas (lunes a domingo) que cubren el mes. */
export function celdasDelMes(mes: string): Celda[] {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  const primero = new Date(Date.UTC(a, m - 1, 1)), ultimo = new Date(Date.UTC(a, m, 0));
  const inicio = new Date(primero); inicio.setUTCDate(1 - ((primero.getUTCDay() + 6) % 7));
  const fin = new Date(ultimo); fin.setUTCDate(ultimo.getUTCDate() + (6 - ((ultimo.getUTCDay() + 6) % 7)));
  const r: Celda[] = [];
  for (const d = new Date(inicio); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) r.push({ dia: d.toISOString().slice(0, 10), delMes: d.getUTCMonth() === m - 1 });
  return r;
}

export type DatosCalendario = { zona: string; hoy: string; mes: string; marcas: MarcaTablero[]; tareas: Tarea[]; celdas: Celda[] };
export const MAX_PIEZAS_MES = 600;

export async function cargarCalendario(sb: SupabaseClient, agenciaId: string, mesPedido: string, marcaPedida: string, ahora = new Date()): Promise<DatosCalendario> {
  const [agencia, marcas] = await Promise.all([sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle(), cargarMarcasActivas(sb)]);
  if (agencia.error) throw new Error(`No se pudo cargar la agencia (${agencia.error.code ?? 'sin código'})`);
  const zona = zonaValida((agencia.data as { zona_horaria?: unknown } | null)?.zona_horaria);
  const hoy = diaEnZona(ahora, zona);
  const mes = mesValido(mesPedido) ?? hoy.slice(0, 7);
  const celdas = celdasDelMes(mes);
  const activas = marcas.map((m) => m.id);
  const ids = esUuid(marcaPedida) && activas.includes(marcaPedida) ? [marcaPedida] : activas;
  let tareas: Tarea[] = [];
  if (ids.length) {
    const r = await sb.from('tareas').select('id,marca_id,titulo,formato,fecha_programada,estado,aprobacion,responsable_id,creada_en,publicada_en')
      .in('marca_id', ids).gte('fecha_programada', celdas[0]!.dia).lte('fecha_programada', celdas[celdas.length - 1]!.dia)
      .order('fecha_programada', { ascending: true }).order('creada_en', { ascending: true }).limit(MAX_PIEZAS_MES);
    if (r.error) throw new Error(`No se pudo cargar el calendario (${r.error.code ?? 'sin código'})`);
    tareas = (Array.isArray(r.data) ? r.data : []).flatMap((f) => { const t = leerTarea(f as Record<string, unknown>); return t ? [t] : []; });
  }
  return { zona, hoy, mes, marcas, tareas, celdas };
}
