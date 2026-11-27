// Carga de datos del Tablero. Todo se lee con la sesión de la persona: las políticas RLS deciden qué marcas y piezas ve
// (Administrador y Dirección todas; Community Manager y Cliente las asignadas; Diseñador solo las piezas que tiene a su cargo).
import type { SupabaseClient } from '@supabase/supabase-js';
import { esUuid } from './usuarios.ts';
import { diaEnZona, zonaValida } from './panel.ts';
import { enlaceSeguro, leerTarea, type Tarea } from './tablero.ts';

export type MarcaTablero = { id: string; nombre: string; corto: string };
export type Persona = { id: string; nombre: string };
export type DatosTablero = { zona: string; hoy: string; marcas: MarcaTablero[]; disenadores: Persona[]; tareas: Tarea[]; nombres: Map<string, string> };

export const MAX_ABIERTAS = 300, MAX_PUBLICADAS = 30;

type Resultado = { data: unknown; error: { code?: string } | null };
function filas(r: Resultado, que: string): Record<string, unknown>[] {
  if (r.error) throw new Error(`No se pudo cargar ${que} (${r.error.code ?? 'sin código'})`);   // solo el código: el mensaje puede traer datos
  return Array.isArray(r.data) ? r.data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');
const COLUMNAS = 'id,marca_id,titulo,formato,fecha_programada,estado,aprobacion,responsable_id,creada_en,publicada_en';

export async function cargarMarcasActivas(sb: SupabaseClient): Promise<MarcaTablero[]> {
  const r = filas(await sb.from('marcas').select('id,nombre,nombre_corto,activa').order('nombre', { ascending: true }).limit(500), 'las marcas');
  return r.filter((f) => f['activa'] !== false && esUuid(txt(f['id']))).map((f) => ({ id: txt(f['id']), nombre: txt(f['nombre']), corto: txt(f['nombre_corto']) || txt(f['nombre']) }));
}

/** Nombres de personas por id (para mostrar responsables y autores). */
export async function nombresDe(sb: SupabaseClient, ids: readonly string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const unicos = [...new Set(ids.filter(esUuid))];
  if (unicos.length) for (const f of filas(await sb.from('perfiles').select('id,nombre').in('id', unicos), 'las personas')) m.set(txt(f['id']), txt(f['nombre']));
  return m;
}

/** Diseñadores activos por marca (solo los que la persona puede ver). Para elegir responsable al crear o editar. */
export async function disenadoresPorMarca(sb: SupabaseClient, marcas: readonly string[]): Promise<Map<string, Persona[]>> {
  const r = new Map<string, Persona[]>();
  if (!marcas.length) return r;
  const asign = filas(await sb.from('usuario_marcas').select('usuario_id,marca_id').in('marca_id', marcas).limit(5000), 'los accesos');
  const ids = [...new Set(asign.map((f) => txt(f['usuario_id'])).filter(esUuid))];
  if (!ids.length) return r;
  const gente = filas(await sb.from('perfiles').select('id,nombre,rol,estado').in('id', ids).eq('rol', 'disenador').eq('estado', 'activo'), 'los diseñadores');
  const porId = new Map(gente.map((f) => [txt(f['id']), { id: txt(f['id']), nombre: txt(f['nombre']) }] as const));
  for (const f of asign) { const p = porId.get(txt(f['usuario_id'])); if (p) r.set(txt(f['marca_id']), [...(r.get(txt(f['marca_id'])) ?? []), p]); }
  for (const [k, v] of r) r.set(k, v.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
  return r;
}

export async function cargarTablero(sb: SupabaseClient, agenciaId: string, ahora = new Date()): Promise<DatosTablero> {
  const [agencia, marcas] = await Promise.all([sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle(), cargarMarcasActivas(sb)]);
  if (agencia.error) throw new Error(`No se pudo cargar la agencia (${agencia.error.code ?? 'sin código'})`);
  const zona = zonaValida((agencia.data as { zona_horaria?: unknown } | null)?.zona_horaria);
  const activas = marcas.map((m) => m.id);
  let tareas: Tarea[] = [];
  if (activas.length) {
    const [abiertas, publicadas] = await Promise.all([
      sb.from('tareas').select(COLUMNAS).neq('estado', 'publicado').in('marca_id', activas).order('fecha_programada', { ascending: true }).order('creada_en', { ascending: true }).limit(MAX_ABIERTAS),
      sb.from('tareas').select(COLUMNAS).eq('estado', 'publicado').in('marca_id', activas).order('publicada_en', { ascending: false }).limit(MAX_PUBLICADAS),
    ]);
    tareas = [...filas(abiertas, 'las piezas'), ...filas(publicadas, 'las piezas publicadas')].flatMap((f) => { const t = leerTarea(f); return t ? [t] : []; });
  }
  const nombres = await nombresDe(sb, tareas.flatMap((t) => (t.responsableId ? [t.responsableId] : [])));
  const porMarca = await disenadoresPorMarca(sb, activas);
  const vistos = new Map<string, Persona>();
  for (const l of porMarca.values()) for (const p of l) vistos.set(p.id, p);
  return { zona, hoy: diaEnZona(ahora, zona), marcas, disenadores: [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), tareas, nombres };
}

// ── Una pieza con su historial ──
export type Version = { numero: number; nota: string; autor: string | null; creadoEn: string };
export type Comentario = { id: string; autor: string | null; texto: string; creadoEn: string; viaEnlace: boolean };
export type Publicacion = { canal: string; url: string | null; publicadaEn: string };
export type DetalleTarea = { tarea: Tarea; marca: MarcaTablero; responsable: string | null; versiones: Version[]; comentarios: Comentario[]; publicacion: Publicacion | null; creadaPor: string | null; zona: string; hoy: string };

/** null si la pieza no existe, no es visible para la persona o su marca está archivada. */
export async function cargarDetalle(sb: SupabaseClient, agenciaId: string, id: string, ahora = new Date()): Promise<DetalleTarea | null> {
  const t = filas(await sb.from('tareas').select(`${COLUMNAS},creada_por`).eq('id', id).limit(1), 'la pieza')[0];
  const tarea = t ? leerTarea(t) : null;
  if (!tarea) return null;
  const [agencia, marcas, versiones, comentarios, pubs] = await Promise.all([
    sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle(),
    cargarMarcasActivas(sb),
    sb.from('versiones').select('numero,nota,creado_por,creado_en').eq('tarea_id', id).order('numero', { ascending: false }).limit(100),
    sb.from('comentarios').select('id,autor_id,texto,via_enlace,creado_en').eq('tarea_id', id).order('creado_en', { ascending: true }).limit(500),
    sb.from('publicaciones').select('canal,url,publicada_en').eq('tarea_id', id).limit(1),
  ]);
  const marca = marcas.find((m) => m.id === tarea.marcaId);
  if (!marca) return null;
  const vs = filas(versiones, 'las versiones'), cs = filas(comentarios, 'los comentarios'), ps = filas(pubs, 'la publicación');
  const nombres = await nombresDe(sb, [...(tarea.responsableId ? [tarea.responsableId] : []), ...vs.map((f) => txt(f['creado_por'])), ...cs.map((f) => txt(f['autor_id'])), txt(t?.['creada_por'])]);
  const nom = (x: unknown) => nombres.get(txt(x)) ?? null;
  const zona = zonaValida((agencia.data as { zona_horaria?: unknown } | null)?.zona_horaria);
  const p = ps[0];
  return {
    tarea, marca, responsable: tarea.responsableId ? nombres.get(tarea.responsableId) ?? null : null, creadaPor: nom(t?.['creada_por']), zona, hoy: diaEnZona(ahora, zona),
    versiones: vs.map((f) => ({ numero: Number(f['numero']) || 0, nota: txt(f['nota']), autor: nom(f['creado_por']), creadoEn: txt(f['creado_en']) })),
    comentarios: cs.flatMap((f) => (esUuid(txt(f['id'])) ? [{ id: txt(f['id']), autor: nom(f['autor_id']), texto: txt(f['texto']), creadoEn: txt(f['creado_en']), viaEnlace: f['via_enlace'] === true }] : [])),
    publicacion: p ? { canal: txt(p['canal']), url: enlaceSeguro(p['url']), publicadaEn: tarea.publicadaEn ?? txt(p['publicada_en']) } : null,
  };
}
