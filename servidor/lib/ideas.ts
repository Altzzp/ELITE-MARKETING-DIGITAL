// Reglas puras de Ideas (sin importaciones de Next: se prueba con node --test). Los límites son los de la base (0009).
import { FORMATOS } from './panel.ts';

export const LIMITE_IDEA = { titulo: 200, descripcion: 2000 } as const;
export const ESTADOS_IDEA = ['borrador', 'aprobada', 'en_produccion'] as const;
export type EstadoIdea = (typeof ESTADOS_IDEA)[number];
export const ETIQUETA_ESTADO_IDEA: Record<EstadoIdea, string> = { borrador: 'Borrador', aprobada: 'Aprobada', en_produccion: 'En producción' };

export type Idea = { id: string; marcaId: string; titulo: string; descripcion: string; formato: string; estado: EstadoIdea; origen: 'manual' | 'ia'; creadaPor: string | null; creadaEn: string };

const txt = (x: unknown): string => (typeof x === 'string' ? x : '');
export function leerIdea(f: Record<string, unknown>): Idea | null {
  const id = txt(f['id']), marcaId = txt(f['marca_id']);
  const estado = (ESTADOS_IDEA as readonly unknown[]).includes(f['estado']) ? (f['estado'] as EstadoIdea) : null;
  if (!id || !marcaId || !estado) return null;
  return { id, marcaId, titulo: txt(f['titulo']), descripcion: txt(f['descripcion']), formato: txt(f['formato']), estado, origen: f['origen'] === 'ia' ? 'ia' : 'manual', creadaPor: txt(f['creada_por']) || null, creadaEn: txt(f['creada_en']) };
}

// Permisos (la base los vuelve a comprobar): el cliente no ve las ideas; el diseñador crea, descarta las suyas y las pasa al Tablero.
export const puedeCrearIdeas = (rol: string): boolean => rol !== 'cliente';
export const puedeGestionarIdeas = (rol: string): boolean => rol === 'administrador' || rol === 'direccion' || rol === 'community_manager';
export const puedeDescartar = (rol: string, i: Idea, yo: string): boolean => i.estado !== 'en_produccion' && (puedeGestionarIdeas(rol) || (puedeCrearIdeas(rol) && i.creadaPor === yo));

export const AVISOS_IDEAS: Record<string, { tipo: 'ok' | 'error'; texto: string }> = {
  creada: { tipo: 'ok', texto: 'Idea guardada en el banco.' },
  aprobada: { tipo: 'ok', texto: 'La idea quedó aprobada.' },
  borrador: { tipo: 'ok', texto: 'La idea volvió a borrador.' },
  descartada: { tipo: 'ok', texto: 'La idea se descartó.' },
  convertida: { tipo: 'ok', texto: 'La idea pasó al Tablero como una pieza nueva.' },
  titulo: { tipo: 'error', texto: `Escribe el título de la idea (hasta ${LIMITE_IDEA.titulo} caracteres).` },
  descripcion: { tipo: 'error', texto: `La descripción es demasiado larga (hasta ${LIMITE_IDEA.descripcion} caracteres).` },
  formato: { tipo: 'error', texto: 'Elige el formato de la idea.' },
  marca: { tipo: 'error', texto: 'Elige la marca de la idea.' },
  fecha: { tipo: 'error', texto: 'Indica una fecha de publicación válida para pasarla al Tablero.' },
  'sin-permiso': { tipo: 'error', texto: 'Tu rol no puede hacer eso.' },
  'no-idea': { tipo: 'error', texto: 'No encontramos esa idea. Quizá ya la descartaron.' },
  'ya-tarea': { tipo: 'error', texto: 'Esa idea ya es una tarea del Tablero.' },
  'marca-archivada': { tipo: 'error', texto: 'La marca está archivada: restáurala para trabajar con sus ideas.' },
  datos: { tipo: 'error', texto: 'No pudimos entender el envío. Inténtalo de nuevo.' },
  generico: { tipo: 'error', texto: 'No se pudo completar la acción. Inténtalo de nuevo; si sigue igual, avisa a soporte.' },
};

/** Código de aviso para un error de la base (por código y, si hace falta, por el texto en español que escribimos en las funciones). */
export function codigoDeError(error: { code?: string; message?: string }): string {
  const m = error.message ?? '';
  if (error.code === '42501') return 'sin-permiso';
  if (error.code === 'P0002') return /marca/i.test(m) ? 'marca' : 'no-idea';
  if (/ya es una tarea/i.test(m)) return 'ya-tarea';
  if (/archivada/i.test(m)) return 'marca-archivada';
  if (/Revisa el año|fecha de publicación/i.test(m)) return 'fecha';
  if (/título es obligatorio/i.test(m)) return 'titulo';
  if (/demasiado larga/i.test(m)) return 'descripcion';
  if (/Elige un formato/i.test(m)) return 'formato';
  return 'generico';
}

export function destinoIdeas(aviso?: string, marca?: string): string {
  const q = new URLSearchParams();
  if (marca) q.set('marca', marca);
  if (aviso && Object.hasOwn(AVISOS_IDEAS, aviso)) q.set(AVISOS_IDEAS[aviso]!.tipo === 'error' ? 'e' : 'a', aviso);
  const s = q.toString();
  return s ? `/ideas?${s}` : '/ideas';
}

export const esFormato = (x: unknown): x is (typeof FORMATOS)[number] => (FORMATOS as readonly unknown[]).includes(x);
