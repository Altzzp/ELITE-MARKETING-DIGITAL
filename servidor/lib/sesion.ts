import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { clienteServidor } from './supabase.ts';
import { esRol, esTema, ordenarModulos, type ModuloId, type Rol, type Tema } from './modulos.ts';

export type Sesion = {
  usuario: { id: string; correo: string };
  perfil: { nombre: string; rol: Rol; tema: Tema; agenciaId: string };
  agencia: string;
  modulos: ModuloId[];
};
export type Estado =
  | { ok: true; sesion: Sesion }
  | { ok: false; motivo: 'sin_sesion' | 'suspendida' | 'sin_perfil' | 'error' };

const esErrorDeRed = (e: { name?: string; status?: number }) => e.name === 'AuthRetryableFetchError' || e.status === 0 || (e.status !== undefined && e.status >= 500);

/** Verifica la sesión contra Supabase (getUser, no solo la cookie) y carga perfil, agencia y módulos permitidos. Es la verificación que manda: proxy.ts solo adelanta el trabajo. */
export async function cargarEstado(sb: SupabaseClient): Promise<Estado> {
  const { data: { user }, error: errorUsuario } = await sb.auth.getUser();
  if (errorUsuario || !user) return { ok: false, motivo: errorUsuario && esErrorDeRed(errorUsuario) ? 'error' : 'sin_sesion' };

  const { data: perfil, error: errorPerfil } = await sb.from('perfiles').select('nombre,rol,estado,tema,agencia_id').eq('id', user.id).maybeSingle();
  if (errorPerfil) return { ok: false, motivo: 'error' };
  if (!perfil || !esRol(perfil.rol)) return { ok: false, motivo: 'sin_perfil' };
  if (perfil.estado !== 'activo') return { ok: false, motivo: 'suspendida' };

  const [agencia, permisos] = await Promise.all([
    sb.from('agencias').select('nombre').eq('id', perfil.agencia_id).maybeSingle(),
    sb.from('permisos_rol').select('modulo').eq('rol', perfil.rol),   // RLS limita las filas a la agencia de la persona
  ]);
  if (agencia.error || permisos.error) return { ok: false, motivo: 'error' };

  return {
    ok: true,
    sesion: {
      usuario: { id: user.id, correo: user.email ?? '' },
      perfil: { nombre: String(perfil.nombre ?? ''), rol: perfil.rol, tema: esTema(perfil.tema) ? perfil.tema : 'sistema', agenciaId: String(perfil.agencia_id) },
      agencia: String(agencia.data?.nombre ?? ''),
      modulos: ordenarModulos((permisos.data ?? []).map((f: { modulo: unknown }) => f.modulo)),
    },
  };
}

/** Una sola verificación por petición, aunque la pidan el layout y la página. */
export const estadoSesion = cache(async (): Promise<Estado> => cargarEstado(await clienteServidor()));

/** Para cada página y acción protegida (los layouts no se vuelven a ejecutar al navegar, así que no bastan). */
export async function exigirSesion(): Promise<Sesion> {
  const e = await estadoSesion();
  if (e.ok) return e.sesion;
  if (e.motivo === 'sin_sesion') redirect('/login');
  if (e.motivo === 'error') throw new Error('No se pudo verificar la sesión');
  redirect(`/auth/cerrar?motivo=${e.motivo}`);   // suspendida o sin perfil: se cierra la sesión (las cookies no se pueden borrar desde un layout)
}

/** Igual que exigirSesion, y además comprueba que el rol de la persona tenga ese módulo. */
export async function exigirModulo(modulo: ModuloId): Promise<Sesion> {
  const s = await exigirSesion();
  if (!s.modulos.includes(modulo)) redirect('/panel?e=sin-acceso');
  return s;
}
