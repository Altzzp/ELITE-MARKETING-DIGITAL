// Reglas puras del Panel: fechas en la zona horaria de la agencia, porcentajes, lectura segura de las filas de la base y datos de los gráficos.
// Sin importaciones externas (solo tipos): se prueba con node --test.

export const ESTADOS_TAREA = ['en_diseno', 'en_revision', 'aprobado', 'publicado'] as const;
export type EstadoTarea = (typeof ESTADOS_TAREA)[number];
export const esEstadoTarea = (x: unknown): x is EstadoTarea => typeof x === 'string' && (ESTADOS_TAREA as readonly string[]).includes(x);
export const ETIQUETA_ESTADO_TAREA: Record<EstadoTarea, string> = { en_diseno: 'En diseño', en_revision: 'En revisión', aprobado: 'Aprobado', publicado: 'Publicado' };

export const FORMATOS = ['post', 'reel', 'historia', 'carrusel', 'banner'] as const;
export type Formato = (typeof FORMATOS)[number];
export const etiquetaFormato = (x: unknown): string => (typeof x === 'string' && (FORMATOS as readonly string[]).includes(x) ? x.charAt(0).toUpperCase() + x.slice(1) : '—');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Zona horaria usable; si la guardada no es válida se usa UTC en vez de romper la pantalla. */
export function zonaValida(z: unknown): string {
  if (typeof z !== 'string' || !z) return 'UTC';
  try { new Intl.DateTimeFormat('es-PE', { timeZone: z }); return z; } catch { return 'UTC'; }
}

/** Día (AAAA-MM-DD) en que cae un instante, visto desde la zona de la agencia. '' si la fecha no es válida. */
export function diaEnZona(instante: Date | string | number, zona: string): string {
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zonaValida(zona), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p['year']}-${p['month']}-${p['day']}`;
}

/** Sin publicar y con la fecha programada ya pasada (hoy no cuenta como atrasada). Mismo criterio que metricas() en la base. */
export const estaAtrasada = (fechaProgramada: string, estado: unknown, hoy: string): boolean =>
  estado !== 'publicado' && FECHA.test(fechaProgramada) && FECHA.test(hoy) && fechaProgramada < hoy;

/** Publicada el día programado o antes (por día en la zona de la agencia). Mismo criterio que metricas(). */
export const aTiempo = (publicadaEn: string, fechaProgramada: string, zona: string): boolean => {
  const dia = diaEnZona(publicadaEn, zona);
  return dia !== '' && FECHA.test(fechaProgramada) && dia <= fechaProgramada;
};

export function fechaLarga(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: zonaValida(zona) }).format(instante);
}

/** "20 nov" a partir de AAAA-MM-DD (fecha sin hora: no se desplaza por zonas horarias). */
export function fechaCorta(aaaammdd: string): string {
  if (!FECHA.test(aaaammdd)) return '—';
  const d = new Date(`${aaaammdd}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
}

/** "hace 5 min", "hace 3 h", "ayer", "hace 4 días"; pasado un mes, la fecha. */
export function hace(iso: string, ahora: Date): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const min = Math.floor((ahora.getTime() - t) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  if (h < 48) return 'ayer';
  const dias = Math.floor(h / 24);
  if (dias < 30) return `hace ${dias} días`;
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(t)).replace('.', '');
}

/** "33 %" (sin decimales). Sin total no hay porcentaje. */
export const porcentaje = (parte: number, total: number): string => (total > 0 ? `${Math.round((parte / total) * 100)} %` : '—');

// ───────── Lectura segura de filas ─────────
const entero = (x: unknown): number | null => { const n = typeof x === 'string' && x.trim() !== '' ? Number(x) : x; return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : null; };
const texto = (x: unknown): string | null => (typeof x === 'string' ? x : null);

export type Metrica = { marcaId: string; total: number; publicadas: number; pendientes: number; atrasadas: number; conArchivo: number };
/** Fila de metricas() → Metrica, o null si algo no tiene la forma esperada (se descarta en vez de mostrar números inventados). */
export function leerMetrica(x: unknown): Metrica | null {
  if (typeof x !== 'object' || x === null) return null;
  const f = x as Record<string, unknown>;
  const marcaId = texto(f['marca_id']), total = entero(f['total']), publicadas = entero(f['publicadas']), pendientes = entero(f['pendientes']), atrasadas = entero(f['atrasadas']), conArchivo = entero(f['con_archivo']);
  if (!marcaId || total === null || publicadas === null || pendientes === null || atrasadas === null || conArchivo === null) return null;
  return { marcaId, total, publicadas, pendientes, atrasadas, conArchivo };
}

export type Totales = { total: number; publicadas: number; pendientes: number; atrasadas: number; conArchivo: number };
export function sumarMetricas(filas: readonly Metrica[]): Totales {
  return filas.reduce<Totales>((t, m) => ({ total: t.total + m.total, publicadas: t.publicadas + m.publicadas, pendientes: t.pendientes + m.pendientes, atrasadas: t.atrasadas + m.atrasadas, conArchivo: t.conArchivo + m.conArchivo }),
    { total: 0, publicadas: 0, pendientes: 0, atrasadas: 0, conArchivo: 0 });
}

/** Filas de tareas_por_estado() → los cuatro estados, con cero donde falte o venga algo raro. */
export function conteoPorEstado(filas: readonly unknown[]): Record<EstadoTarea, number> {
  const r: Record<EstadoTarea, number> = { en_diseno: 0, en_revision: 0, aprobado: 0, publicado: 0 };
  for (const x of filas) {
    if (typeof x !== 'object' || x === null) continue;
    const f = x as Record<string, unknown>, n = entero(f['total']);
    if (esEstadoTarea(f['estado']) && n !== null) r[f['estado']] = n;
  }
  return r;
}

// ───────── Gráficos (SVG con atributos: la CSP no admite estilos en línea) ─────────
export type Segmento = { estado: EstadoTarea; total: number; largo: number; desde: number };
/** Reparte una circunferencia de longitud 100 entre los estados (para stroke-dasharray con pathLength=100). Sin datos, no hay segmentos. */
export function segmentosDona(conteo: Record<EstadoTarea, number>): Segmento[] {
  const suma = ESTADOS_TAREA.reduce((a, e) => a + conteo[e], 0);
  if (suma <= 0) return [];
  let acumulado = 0;
  const r: Segmento[] = [];
  for (const e of ESTADOS_TAREA) {
    if (conteo[e] <= 0) continue;
    const largo = (conteo[e] / suma) * 100;
    r.push({ estado: e, total: conteo[e], largo: Math.round(largo * 100) / 100, desde: Math.round(acumulado * 100) / 100 });
    acumulado += largo;
  }
  return r;
}

/** Ancho (0–100) de una barra respecto del máximo del grupo. Un valor mayor que cero siempre se ve (mínimo 2). */
export const anchoBarra = (valor: number, maximo: number): number => (maximo <= 0 || valor <= 0 ? 0 : Math.max(2, Math.min(100, Math.round((valor / maximo) * 100))));
