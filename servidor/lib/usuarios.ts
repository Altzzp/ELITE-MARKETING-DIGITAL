// Reglas de la pantalla "Usuarios y roles". Sin importaciones externas: se prueba con node --test.
import type { ModuloId, Rol } from './modulos.ts';

export const ESTADOS = ['activo', 'suspendido'] as const;
export type Estado = (typeof ESTADOS)[number];
export const esEstado = (x: unknown): x is Estado => x === 'activo' || x === 'suspendido';

export const ETIQUETA_ESTADO: Record<Estado, string> = { activo: 'Activo', suspendido: 'Suspendido' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (x: unknown): x is string => typeof x === 'string' && UUID.test(x);

/** De los valores de un formulario deja los identificadores válidos, sin repetir y con un tope razonable. */
export function normalizarIds(valores: readonly unknown[], max = 200): string[] {
  return [...new Set(valores.filter(esUuid).map((v) => v.toLowerCase()))].slice(0, max);
}

/** Estos roles ven todas las marcas; para el resto hay que asignarlas una por una. */
export const ROLES_CON_TODAS_LAS_MARCAS: readonly Rol[] = ['administrador', 'direccion'];
export const veTodasLasMarcas = (rol: Rol): boolean => ROLES_CON_TODAS_LAS_MARCAS.includes(rol);

/** Solo el Administrador gestiona personas y permisos (la base de datos lo exige también: esto solo evita mostrar controles que no funcionarían). */
export const puedeAdministrar = (rol: Rol): boolean => rol === 'administrador';

/** Permisos que no se pueden quitar. Devuelve el motivo, o null si se puede cambiar. Coincide con el disparador de la migración 0005. */
export function permisoFijo(rol: Rol, modulo: ModuloId): string | null {
  if (modulo === 'apariencia') return 'Todos los roles pueden elegir su modo claro u oscuro.';
  if (rol === 'administrador' && (modulo === 'panel' || modulo === 'usuarios')) return 'El Administrador siempre necesita esta sección para poder administrar la plataforma.';
  return null;
}

/** Iniciales para el avatar: primera letra de las dos primeras palabras. */
export function iniciales(nombre: string): string {
  const letras = nombre.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => [...p][0]!.toUpperCase());
  return letras.join('') || '?';
}

export type AvisoUsuarios = { tipo: 'ok' | 'error'; texto: string };

/** Avisos tras una acción (la URL lleva solo el código; el texto sale de esta lista, nunca de la URL). */
export const AVISOS_USUARIOS: Record<string, AvisoUsuarios> = {
  invitada: { tipo: 'ok', texto: 'Invitación registrada.' },   // la página le añade la dirección donde la persona crea su cuenta
  revocada: { tipo: 'ok', texto: 'Invitación revocada. Esa persona ya no puede crear su cuenta con ese correo.' },
  rol: { tipo: 'ok', texto: 'Rol actualizado. La persona lo verá en su próxima visita.' },
  suspendida: { tipo: 'ok', texto: 'Cuenta suspendida. La persona queda fuera en su próxima visita; sus datos se conservan.' },
  reactivada: { tipo: 'ok', texto: 'Cuenta reactivada.' },
  marcas: { tipo: 'ok', texto: 'Marcas actualizadas.' },
  permiso: { tipo: 'ok', texto: 'Permiso actualizado. Se aplica en la próxima visita de cada persona con ese rol.' },
  'solo-admin': { tipo: 'error', texto: 'Solo un Administrador puede hacer esto.' },
  datos: { tipo: 'error', texto: 'Revisa los datos del formulario e inténtalo de nuevo.' },
  correo: { tipo: 'error', texto: 'Escribe un correo válido.' },
  'ya-cuenta': { tipo: 'error', texto: 'Esa persona ya tiene cuenta.' },
  'invitacion-otra': { tipo: 'error', texto: 'Ese correo ya tiene una invitación pendiente en otra agencia.' },
  propio: { tipo: 'error', texto: 'No puedes cambiar tu propio rol ni tu estado; pídeselo a otro Administrador.' },
  'no-persona': { tipo: 'error', texto: 'No encontramos a esa persona.' },
  'no-invitacion': { tipo: 'error', texto: 'Esa invitación ya no está pendiente.' },
  esencial: { tipo: 'error', texto: 'Ese permiso no se puede quitar: lo necesita el sistema para funcionar.' },
  'marca-ajena': { tipo: 'error', texto: 'Alguna de las marcas elegidas no pertenece a tu agencia.' },
  generico: { tipo: 'error', texto: 'No se pudo completar la acción. Inténtalo de nuevo; si sigue igual, avisa a soporte.' },
};

export const PESTANAS = ['usuarios', 'permisos'] as const;
export type Pestana = (typeof PESTANAS)[number];
export const esPestana = (x: unknown): x is Pestana => x === 'usuarios' || x === 'permisos';

/** Traduce el error de una función de la base de datos (mensajes de 0003 y 0005) a un código de AVISOS_USUARIOS. */
export function codigoDeError(e: { code?: string; message?: string } | null | undefined): keyof typeof AVISOS_USUARIOS {
  const m = e?.message ?? '';
  if (e?.code === '42501' || /Solo el administrador/i.test(m)) return 'solo-admin';
  if (/Correo no válido/i.test(m)) return 'correo';
  if (/ya tiene cuenta/i.test(m)) return 'ya-cuenta';
  if (/No encontramos esa invitación/i.test(m)) return 'no-invitacion';   // antes que la siguiente: ambos mensajes dicen "invitación pendiente"
  if (/ya tiene una invitación pendiente/i.test(m)) return 'invitacion-otra';
  if (/propio rol|tu estado/i.test(m)) return 'propio';
  if (/No encontramos a esa persona/i.test(m)) return 'no-persona';
  if (/no se puede quitar|siempre necesita/i.test(m)) return 'esencial';
  if (/marca que no pertenece/i.test(m)) return 'marca-ajena';
  return 'generico';
}

/** Dirección de /usuarios con la pestaña y el aviso (solo valores de listas conocidas). */
export function destino(pestana: Pestana, aviso?: keyof typeof AVISOS_USUARIOS): string {
  const q = new URLSearchParams();
  if (pestana !== 'usuarios') q.set('pestana', pestana);
  if (aviso) q.set(AVISOS_USUARIOS[aviso]!.tipo === 'error' ? 'e' : 'a', aviso);
  const s = q.toString();
  return s ? `/usuarios?${s}` : '/usuarios';
}
