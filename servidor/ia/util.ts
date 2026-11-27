// Utilidades pequeñas para leer con seguridad datos que no controlamos (respuestas de modelos, JSON de la base).

export const obj = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {});
export const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
export const txt = (x: unknown): string => (typeof x === 'string' ? x : '');
export const num = (x: unknown): number | undefined => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : undefined);

/** Quita caracteres de control (conserva saltos de línea y tabulaciones) y recorta. */
export const limpiarControl = (x: unknown, max: number): string =>
  txt(x).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').slice(0, max);

/** AAAA-MM-DD y que exista en el calendario (rechaza 2026-02-31). */
export function esFechaIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Fecha de hoy (AAAA-MM-DD) en la zona horaria de la agencia; si la zona no es válida, en UTC. */
export function hoyEnZona(zona: string | null | undefined, ahora: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  } catch {
    return ahora.toISOString().slice(0, 10);
  }
}

/** Estimación de tokens cuando el proveedor no informa el consumo: así el límite de uso nunca queda en cero. */
export const estimarTokens = (texto: string): number => Math.ceil(texto.length / 3);
