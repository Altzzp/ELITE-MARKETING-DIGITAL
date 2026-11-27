// Reglas puras de la pantalla Aprobaciones. Los permisos, límites, avisos y traducción de errores son los del Tablero
// (las mismas funciones de la base de datos): aquí solo cambia la dirección a la que se vuelve tras cada acción.
import { AVISOS_TABLERO, puedeDecidir, type AvisoTablero } from './tablero.ts';

export { AVISOS_TABLERO as AVISOS_APROBACIONES, puedeDecidir as puedeDecidirAqui };
export type { AvisoTablero };

export const ETIQUETA_RESULTADO = { aprobada: 'Aprobada', cambios: 'Cambios pedidos' } as const;

/** Dirección de Aprobaciones con un aviso conocido (el texto sale de la lista, nunca de la dirección). */
export function destinoAprobaciones(aviso?: keyof typeof AVISOS_TABLERO): string {
  if (!aviso) return '/aprobaciones';
  return `/aprobaciones?${AVISOS_TABLERO[aviso]!.tipo === 'error' ? 'e' : 'a'}=${aviso}`;
}
