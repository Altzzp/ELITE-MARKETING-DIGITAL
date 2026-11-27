// Reglas puras del Tablero: permisos, lectura segura de filas, filtros, validación del formulario y textos de aviso.
// Los límites y mensajes coinciden con la migración 0008; la base de datos los exige también (esto solo da el aviso junto al campo).
// Sin importaciones externas (solo tipos): se prueba con node --test.
import type { Rol } from './modulos.ts';
import { esUuid } from './usuarios.ts';
import { ESTADOS_TAREA, FORMATOS, esEstadoTarea, estaAtrasada, type EstadoTarea } from './panel.ts';

export const LIMITE = { titulo: 200, nota: 500, comentario: 4000, canal: 40, url: 500 } as const;
export const CANALES = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Pinterest', 'Sitio web', 'Correo'] as const;
export const MAX_DIAS_FUTURO = 1095;
export const MINIMA_FECHA = '2020-01-01';

// ── Permisos (la base de datos los exige igual; esto solo evita mostrar controles que no funcionarían) ──
export const puedeCrearTareas = (r: Rol): boolean => r !== 'cliente';
export const puedeEditarTareas = (r: Rol): boolean => r === 'administrador' || r === 'direccion' || r === 'community_manager';
export const puedeMoverTareas = (r: Rol): boolean => r !== 'cliente';
export const puedeDecidir = (r: Rol): boolean => r === 'administrador' || r === 'direccion' || r === 'cliente';
export const puedePublicar = puedeEditarTareas;
export const puedeSubirVersion = puedeMoverTareas;
export const puedeElegirResponsable = puedeEditarTareas;

export type Aprobacion = 'ninguna' | 'pendiente' | 'aprobada' | 'cambios';
const APROBACIONES: readonly string[] = ['ninguna', 'pendiente', 'aprobada', 'cambios'];
export const ETIQUETA_APROBACION: Record<Aprobacion, string> = { ninguna: 'Sin enviar', pendiente: 'Esperando al cliente', aprobada: 'Aprobada', cambios: 'Con cambios pedidos' };

export type Tarea = {
  id: string; marcaId: string; titulo: string; formato: string; fecha: string; estado: EstadoTarea; aprobacion: Aprobacion;
  responsableId: string | null; creadaEn: string; publicadaEn: string | null;
};
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');

/** Fila de `tareas` → Tarea, o null si no tiene la forma esperada (se descarta en vez de mostrar datos inventados). */
export function leerTarea(x: unknown): Tarea | null {
  if (typeof x !== 'object' || x === null) return null;
  const f = x as Record<string, unknown>;
  const id = txt(f['id']), marcaId = txt(f['marca_id']);
  if (!esUuid(id) || !esUuid(marcaId) || !esEstadoTarea(f['estado'])) return null;
  const ap = txt(f['aprobacion']);
  return {
    id: id.toLowerCase(), marcaId: marcaId.toLowerCase(), titulo: txt(f['titulo']), formato: txt(f['formato']), fecha: txt(f['fecha_programada']).slice(0, 10),
    estado: f['estado'], aprobacion: (APROBACIONES.includes(ap) ? ap : 'ninguna') as Aprobacion,
    responsableId: esUuid(txt(f['responsable_id'])) ? txt(f['responsable_id']).toLowerCase() : null,
    creadaEn: txt(f['creada_en']), publicadaEn: txt(f['publicada_en']) || null,
  };
}

/** Una dirección solo se muestra como enlace si es http(s) (la base ya lo exige; esto cubre datos antiguos o importados). */
export const enlaceSeguro = (u: unknown): string | null => (typeof u === 'string' && u.length <= LIMITE.url && /^https?:\/\/[^\s<>"]+$/i.test(u) ? u : null);

// ── Qué se puede hacer con una pieza ──
export type AccionTarea = 'version' | 'enviar' | 'devolver' | 'aprobar' | 'cambios' | 'publicar' | 'editar';
export function accionesDisponibles(rol: Rol, t: Pick<Tarea, 'estado' | 'aprobacion'>): AccionTarea[] {
  if (t.estado === 'publicado') return [];
  const a: AccionTarea[] = [];
  if (t.estado === 'en_diseno') { if (puedeSubirVersion(rol)) a.push('version'); if (puedeMoverTareas(rol)) a.push('enviar'); }
  if (t.estado === 'en_revision') {
    if (puedeDecidir(rol) && t.aprobacion === 'pendiente') a.push('aprobar', 'cambios');
    if (puedeMoverTareas(rol)) a.push('devolver');
  }
  if (t.estado === 'aprobado') { if (puedePublicar(rol)) a.push('publicar'); if (puedeMoverTareas(rol)) a.push('devolver'); }
  if (puedeEditarTareas(rol)) a.push('editar');
  return a;
}

// ── Filtros y columnas ──
export type Filtros = { q: string; marca: string; responsable: string };
const sinAcentos = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** `responsable`: '' = todos, 'yo' = mis piezas, 'sin' = sin responsable, o el id de una persona. */
export function filtrarTareas(ts: readonly Tarea[], f: Filtros, yo: string): Tarea[] {
  const q = sinAcentos(f.q.trim());
  return ts.filter((t) =>
    (!q || sinAcentos(t.titulo).includes(q)) &&
    (!f.marca || t.marcaId === f.marca) &&
    (!f.responsable || (f.responsable === 'yo' ? t.responsableId === yo : f.responsable === 'sin' ? t.responsableId === null : t.responsableId === f.responsable)));
}
export function agruparPorEstado(ts: readonly Tarea[]): Record<EstadoTarea, Tarea[]> {
  const r: Record<EstadoTarea, Tarea[]> = { en_diseno: [], en_revision: [], aprobado: [], publicado: [] };
  for (const t of ts) r[t.estado].push(t);
  for (const e of ESTADOS_TAREA) r[e].sort((a, b) => (e === 'publicado' ? (b.publicadaEn ?? '').localeCompare(a.publicadaEn ?? '') : a.fecha.localeCompare(b.fecha) || a.creadaEn.localeCompare(b.creadaEn)));
  return r;
}
/** "Atrasada", "Hoy" o "" según la fecha programada (por día en la zona de la agencia, igual que el Panel). */
export const plazo = (t: Pick<Tarea, 'fecha' | 'estado'>, hoy: string): 'atrasada' | 'hoy' | '' => (estaAtrasada(t.fecha, t.estado, hoy) ? 'atrasada' : t.estado !== 'publicado' && t.fecha === hoy ? 'hoy' : '');

// ── Formulario de crear y editar ──
export type Lector = { get(k: string): unknown };
export type ValoresTarea = { marca: string; titulo: string; formato: string; fecha: string; responsable: string };
export type ErroresTarea = Record<string, string>;
export type EstadoFormTarea = { errores: ErroresTarea; valores?: ValoresTarea };

const limpiar = (s: string): string => s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim();   // la base no admite caracteres de control
export function leerFormTarea(f: Lector): ValoresTarea {
  const t = (k: string) => { const v = f.get(k); return typeof v === 'string' ? limpiar(v) : ''; };
  return { marca: t('marca').toLowerCase(), titulo: t('titulo'), formato: t('formato'), fecha: t('fecha'), responsable: t('responsable').toLowerCase() };
}
export const valoresDeTarea = (t: Tarea): ValoresTarea => ({ marca: t.marcaId, titulo: t.titulo, formato: t.formato, fecha: t.fecha, responsable: t.responsableId ?? '' });

/** AAAA-MM-DD que existe en el calendario. */
export function fechaReal(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export const fechaMaxima = (hoy: string): string => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + MAX_DIAS_FUTURO); return d.toISOString().slice(0, 10); };

export function validarTarea(v: ValoresTarea, modo: 'crear' | 'editar', hoy: string, marcasPermitidas: readonly string[] = []): ErroresTarea {
  const e: ErroresTarea = {};
  if (modo === 'crear' && !marcasPermitidas.includes(v.marca)) e['marca'] = 'Elige una marca de la lista.';
  if (!v.titulo) e['titulo'] = 'Escribe el título de la tarea.';
  else if (v.titulo.length > LIMITE.titulo) e['titulo'] = `El título admite hasta ${LIMITE.titulo} caracteres.`;
  if (!(FORMATOS as readonly string[]).includes(v.formato)) e['formato'] = 'Elige el formato de la pieza.';
  if (!v.fecha) e['fecha'] = 'Indica la fecha de publicación.';
  else if (!fechaReal(v.fecha)) e['fecha'] = 'Escribe una fecha válida.';
  else if (v.fecha < MINIMA_FECHA || v.fecha > fechaMaxima(hoy)) e['fecha'] = 'Revisa el año de la fecha de publicación.';
  if (v.responsable && !esUuid(v.responsable)) e['responsable'] = 'Elige una persona de la lista.';
  return e;
}

// ── Avisos y errores de la base de datos ──
export type AvisoTablero = { tipo: 'ok' | 'error'; texto: string };
/** Avisos tras una acción (la URL lleva solo el código; el texto sale de esta lista, nunca de la URL). */
export const AVISOS_TABLERO: Record<string, AvisoTablero> = {
  creada: { tipo: 'ok', texto: 'Tarea creada.' },
  guardada: { tipo: 'ok', texto: 'Cambios guardados.' },
  enviada: { tipo: 'ok', texto: 'Enviada a revisión: el cliente ya puede aprobarla.' },
  devuelta: { tipo: 'ok', texto: 'La pieza volvió a diseño.' },
  aprobada: { tipo: 'ok', texto: 'Pieza aprobada.' },
  'cambios-pedidos': { tipo: 'ok', texto: 'Cambios pedidos: la pieza volvió a diseño con tu comentario.' },
  publicada: { tipo: 'ok', texto: 'Publicación confirmada.' },
  version: { tipo: 'ok', texto: 'Versión subida.' },
  comentario: { tipo: 'ok', texto: 'Comentario agregado.' },
  'sin-permiso': { tipo: 'error', texto: 'Tu rol no permite esta acción.' },
  'no-marca': { tipo: 'error', texto: 'No encontramos esa marca. Quizá ya no existe o no tienes acceso a ella.' },
  'no-tarea': { tipo: 'error', texto: 'No encontramos esa tarea. Quizá ya no existe o no es tuya.' },
  'marca-archivada': { tipo: 'error', texto: 'La marca está archivada. Restáurala en Información de marcas para seguir trabajando en sus piezas.' },
  'publicada-cerrada': { tipo: 'error', texto: 'Una pieza publicada ya no se mueve ni se edita.' },
  'version-en-revision': { tipo: 'error', texto: 'Solo se sube una versión nueva con la pieza en diseño. Devuélvela a diseño primero: así la versión que se revisa o se aprobó no cambia.' },
  'sin-version': { tipo: 'error', texto: 'Sube al menos una versión antes de enviar a revisión.' },
  'ya-en-revision': { tipo: 'error', texto: 'La pieza ya está en revisión o aprobada.' },
  'no-aprobada': { tipo: 'error', texto: 'La pieza debe estar aprobada antes de publicarse.' },
  'no-pendiente': { tipo: 'error', texto: 'Esta pieza no está esperando una decisión.' },
  'faltan-cambios': { tipo: 'error', texto: 'Explica qué cambios necesitas.' },
  canal: { tipo: 'error', texto: 'Indica el canal de publicación (hasta 40 caracteres).' },
  enlace: { tipo: 'error', texto: 'El enlace debe empezar por http:// o https://, sin espacios (hasta 500 caracteres).' },
  nota: { tipo: 'error', texto: 'La nota de la versión admite hasta 500 caracteres.' },
  'comentario-vacio': { tipo: 'error', texto: 'Escribe el comentario (hasta 4000 caracteres).' },
  datos: { tipo: 'error', texto: 'Revisa los datos e inténtalo de nuevo.' },
  generico: { tipo: 'error', texto: 'No se pudo completar la acción. Inténtalo de nuevo; si sigue igual, avisa a soporte.' },
};
export type ErrorDeBase = { code?: string; message?: string } | null | undefined;
export type Traduccion = { campo: string; texto: string } | { aviso: keyof typeof AVISOS_TABLERO };

/** Traduce un error de las funciones de 0003 y 0008 a un error junto a un campo o a un código de aviso. */
export function traducirError(e: ErrorDeBase): Traduccion {
  const m = e?.message ?? '';
  if (/Escribe el título/i.test(m)) return { campo: 'titulo', texto: `Escribe el título de la tarea (hasta ${LIMITE.titulo} caracteres).` };
  if (/Elige el formato|formato_pieza/i.test(m)) return { campo: 'formato', texto: 'Elige el formato de la pieza.' };
  if (/Indica la fecha|Revisa el año|date\/time|invalid input syntax for type date/i.test(m)) return { campo: 'fecha', texto: 'Revisa la fecha de publicación.' };
  if (/no es un diseñador activo/i.test(m)) return { campo: 'responsable', texto: 'Esa persona no es un diseñador activo de esta marca.' };
  if (/archivada/i.test(m)) return { aviso: 'marca-archivada' };
  if (/No encontramos esa marca/i.test(m)) return { aviso: 'no-marca' };
  if (/No encontramos esa tarea/i.test(m)) return { aviso: 'no-tarea' };
  if (e?.code === '42501' || /Tu rol no puede/i.test(m)) return { aviso: 'sin-permiso' };
  if (/Una pieza publicada ya no/i.test(m)) return { aviso: 'publicada-cerrada' };
  if (/Devuelve la pieza a diseño/i.test(m)) return { aviso: 'version-en-revision' };
  if (/Sube al menos una versión/i.test(m)) return { aviso: 'sin-version' };
  if (/ya está en revisión o aprobada/i.test(m)) return { aviso: 'ya-en-revision' };
  if (/debe estar aprobada/i.test(m)) return { aviso: 'no-aprobada' };
  if (/no está esperando una decisión/i.test(m)) return { aviso: 'no-pendiente' };
  if (/Explica qué cambios/i.test(m)) return { aviso: 'faltan-cambios' };
  if (/Indica el canal|El canal admite/i.test(m)) return { aviso: 'canal' };
  if (/El enlace debe empezar|publicaciones_url_http/i.test(m)) return { aviso: 'enlace' };
  if (/La nota de la versión|versiones_nota_corta/i.test(m)) return { aviso: 'nota' };
  if (/Escribe el comentario/i.test(m)) return { aviso: 'comentario-vacio' };
  return { aviso: 'generico' };
}

// ── Direcciones ──
/** Dirección del Tablero (o de una pieza) con filtros y aviso: solo ids válidos y valores conocidos. */
export function destinoTablero(o: { id?: string | null; q?: string; marca?: string; responsable?: string; aviso?: keyof typeof AVISOS_TABLERO } = {}): string {
  const p = new URLSearchParams();
  if (!o.id) {
    if (o.q) p.set('q', o.q.slice(0, 80));
    if (o.marca && esUuid(o.marca)) p.set('marca', o.marca.toLowerCase());
    if (o.responsable && (o.responsable === 'yo' || o.responsable === 'sin' || esUuid(o.responsable))) p.set('responsable', o.responsable.toLowerCase());
  }
  if (o.aviso) p.set(AVISOS_TABLERO[o.aviso]!.tipo === 'error' ? 'e' : 'a', o.aviso);
  const s = p.toString();
  const base = o.id && esUuid(o.id) ? `/tablero/${o.id.toLowerCase()}` : '/tablero';
  return s ? `${base}?${s}` : base;
}
