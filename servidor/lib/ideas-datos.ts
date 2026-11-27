// Carga de datos de Ideas. Se lee con la sesión de la persona: RLS deja ver solo las ideas de sus marcas (y el cliente no ve ninguna).
import type { SupabaseClient } from '@supabase/supabase-js';
import { cargarMarcasActivas, nombresDe, type MarcaTablero } from './tablero-datos.ts';
import { leerIdea, type Idea } from './ideas.ts';
import { esUuid } from './usuarios.ts';

export const MAX_IDEAS = 200;
export type DatosIdeas = { marcas: MarcaTablero[]; ideas: Idea[]; nombres: Map<string, string> };

export async function cargarIdeas(sb: SupabaseClient, marca: string): Promise<DatosIdeas> {
  const marcas = await cargarMarcasActivas(sb);
  const activas = marcas.map((m) => m.id);
  let ideas: Idea[] = [];
  if (activas.length) {
    const ids = marca && esUuid(marca) && activas.includes(marca) ? [marca] : activas;
    const r = await sb.from('ideas').select('id,marca_id,titulo,descripcion,formato,estado,origen,creada_por,creada_en').in('marca_id', ids).order('creada_en', { ascending: false }).limit(MAX_IDEAS);
    if (r.error) throw new Error(`No se pudieron cargar las ideas (${r.error.code ?? 'sin código'})`);
    ideas = (Array.isArray(r.data) ? r.data : []).flatMap((f) => { const i = leerIdea(f as Record<string, unknown>); return i ? [i] : []; });
  }
  return { marcas, ideas, nombres: await nombresDe(sb, ideas.flatMap((i) => (i.creadaPor ? [i.creadaPor] : []))) };
}
