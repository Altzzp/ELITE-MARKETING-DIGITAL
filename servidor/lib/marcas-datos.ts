// Carga de datos de "Información de marcas". Todo se lee con la sesión de la persona: las políticas RLS deciden qué marcas ve
// (Administrador y Dirección todas; el resto solo las asignadas).
import type { SupabaseClient } from '@supabase/supabase-js';
import { esRol, type Rol } from './modulos.ts';
import { leerMarca, type Marca } from './marcas.ts';
import { esUuid, veTodasLasMarcas } from './usuarios.ts';

export type Cliente = { id: string; nombre: string; contacto: string };
export type PersonaAcceso = { id: string; nombre: string; email: string; rol: Rol; activa: boolean };

type Resultado = { data: unknown; error: { code?: string } | null };
function filas(r: Resultado, que: string): Record<string, unknown>[] {
  if (r.error) throw new Error(`No se pudo cargar ${que} (${r.error.code ?? 'sin código'})`);   // solo el código: el mensaje puede traer datos
  return Array.isArray(r.data) ? r.data.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];
}
const txt = (x: unknown): string => (typeof x === 'string' ? x : '');

/** Marcas visibles para la persona (activas y archivadas) y los clientes que puede ver. */
export async function cargarMarcas(sb: SupabaseClient): Promise<{ marcas: Marca[]; clientes: Cliente[] }> {
  const [m, c] = await Promise.all([
    sb.from('marcas').select('id,cliente_id,nombre,nombre_corto,sector,publico_objetivo,tono,paleta,tipografias,redes,brief,activa').order('nombre', { ascending: true }).limit(500),
    sb.from('clientes').select('id,nombre,contacto').order('nombre', { ascending: true }).limit(500),
  ]);
  return {
    marcas: filas(m, 'las marcas').map(leerMarca).filter((x): x is Marca => x !== null),
    clientes: filas(c, 'los clientes').filter((f) => esUuid(txt(f['id']))).map((f) => ({ id: txt(f['id']), nombre: txt(f['nombre']), contacto: txt(f['contacto']) })),
  };
}

/** Personas a las que se puede dar acceso a una marca (Administrador y Dirección ya las ven todas) y quiénes la tienen ahora. Solo para el Administrador. */
export async function cargarAcceso(sb: SupabaseClient, marcaId: string): Promise<{ personas: PersonaAcceso[]; conAcceso: Set<string> }> {
  const [p, v] = await Promise.all([
    sb.from('perfiles').select('id,nombre,email,rol,estado').order('nombre', { ascending: true }).limit(500),
    sb.from('usuario_marcas').select('usuario_id').eq('marca_id', marcaId).limit(5000),
  ]);
  const personas = filas(p, 'las personas').flatMap((f) => {
    const rol = f['rol'];
    return esUuid(txt(f['id'])) && esRol(rol) && !veTodasLasMarcas(rol) ? [{ id: txt(f['id']), nombre: txt(f['nombre']), email: txt(f['email']), rol, activa: f['estado'] === 'activo' }] : [];
  });
  return { personas, conAcceso: new Set(filas(v, 'quién tiene acceso').map((f) => txt(f['usuario_id']))) };
}
