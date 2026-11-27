// La respuesta del modelo es texto no confiable: se valida, se recorta y, si no es JSON, se conserva como texto simple.
// La interfaz debe mostrarla siempre como TEXTO (nunca como HTML).
import { FORMATOS, type Elemento, type Formato } from './tipos.ts';
import { arr, esFechaIso, limpiarControl, obj, txt } from './util.ts';

const MAX_ELEMENTOS = 12, MAX_TEXTO = 6000, MAX_TITULO = 140, MAX_CUERPO = 3000;

export interface Parseado { texto: string; elementos: Elemento[]; estructurado: boolean }

function extraerObjeto(s: string): Record<string, unknown> | null {
  const sinCercas = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(s)?.[1] ?? s;
  for (const candidato of [sinCercas, sinCercas.slice(sinCercas.indexOf('{'), sinCercas.lastIndexOf('}') + 1)]) {
    try {
      const j: unknown = JSON.parse(candidato);
      if (j && typeof j === 'object' && !Array.isArray(j)) return j as Record<string, unknown>;
    } catch { /* se prueba con el siguiente candidato */ }
  }
  return null;
}

function elemento(x: unknown, hoy: string): Elemento | null {
  const e = obj(x);
  const cuerpo = limpiarControl(e.cuerpo, MAX_CUERPO).trim();
  const titulo = limpiarControl(e.titulo, MAX_TITULO).trim() || cuerpo.slice(0, 60);
  if (!titulo) return null;
  const f = txt(e.formato).trim().toLowerCase();
  const formato: Formato = (FORMATOS as readonly string[]).includes(f) ? (f as Formato) : 'post';
  const fecha = txt(e.fecha).trim();
  return { titulo, cuerpo, formato, ...(esFechaIso(fecha) && fecha >= hoy ? { fecha } : {}) };
}

export function parsearSalida(crudo: string, hoy: string): Parseado {
  const j = extraerObjeto(crudo.trim());
  if (j) {
    const elementos = arr(j.elementos).map((x) => elemento(x, hoy)).filter((x): x is Elemento => x !== null).slice(0, MAX_ELEMENTOS);   // primero se descartan los inválidos, después se limita
    const texto = limpiarControl(j.texto, MAX_TEXTO).trim() || (elementos.length ? `${elementos.length} propuesta(s) lista(s) para revisar.` : '');
    if (texto) return { texto, elementos, estructurado: true };
  }
  return { texto: limpiarControl(crudo, MAX_TEXTO).trim() || 'El modelo no devolvió contenido legible.', elementos: [], estructurado: false };
}
