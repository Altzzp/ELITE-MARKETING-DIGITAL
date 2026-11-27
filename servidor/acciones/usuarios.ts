'use server';
// Acciones de "Usuarios y roles". Cada una: (1) exige sesión y el módulo, (2) exige rol Administrador, (3) valida los datos y
// (4) llama a una función de la base de datos con la sesión de la persona. La autoridad final es la base (RLS y funciones de 0003/0005):
// las comprobaciones de aquí solo evitan viajes inútiles y dan mensajes claros. Next comprueba además el origen de cada envío (CSRF).
// Al terminar redirigen a /usuarios con un código de aviso (nunca texto libre en la URL).
import { redirect } from 'next/navigation';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { correoValido, normalizarCorreo } from '../lib/seguridad.ts';
import { esModulo, esRol } from '../lib/modulos.ts';
import {
  AVISOS_USUARIOS, codigoDeError, destino, esEstado, esUuid, normalizarIds, permisoFijo, puedeAdministrar, veTodasLasMarcas, type Pestana,
} from '../lib/usuarios.ts';

const campo = (f: FormData, k: string): string => { const v = f.get(k); return typeof v === 'string' ? v.trim() : ''; };
type Aviso = keyof typeof AVISOS_USUARIOS;

async function comoAdministrador() {
  const s = await exigirModulo('usuarios');
  if (!puedeAdministrar(s.perfil.rol)) redirect(destino('usuarios', 'solo-admin'));
  return { sesion: s, sb: await clienteServidor() };
}

/** Termina la acción: aviso de éxito, o el código que corresponda al error de la base de datos. */
function terminar(pestana: Pestana, error: { code?: string; message?: string } | null, exito: Aviso): never {
  if (!error) redirect(destino(pestana, exito));
  const codigo = codigoDeError(error);
  if (codigo === 'generico') console.error('[usuarios] error inesperado de la base de datos', error.code ?? '(sin código)');   // sin el mensaje: puede traer correos
  redirect(destino(pestana, codigo));
}

export async function invitarPersona(form: FormData): Promise<void> {
  const { sb } = await comoAdministrador();
  const correo = normalizarCorreo(campo(form, 'correo')), rol = campo(form, 'rol');
  if (!correoValido(correo)) redirect(destino('usuarios', 'correo'));
  if (!esRol(rol)) redirect(destino('usuarios', 'datos'));
  const marcas = veTodasLasMarcas(rol) ? [] : normalizarIds(form.getAll('marca'));
  const { error } = await sb.rpc('invitar_usuario', { p_email: correo, p_rol: rol, p_marca_ids: marcas });
  terminar('usuarios', error, 'invitada');
}

export async function revocarInvitacion(form: FormData): Promise<void> {
  const { sb } = await comoAdministrador();
  const id = campo(form, 'id');
  if (!esUuid(id)) redirect(destino('usuarios', 'datos'));
  const { error } = await sb.rpc('revocar_invitacion', { p_invitacion: id });
  terminar('usuarios', error, 'revocada');
}

export async function cambiarRol(form: FormData): Promise<void> {
  const { sb } = await comoAdministrador();
  const id = campo(form, 'id'), rol = campo(form, 'rol');
  if (!esUuid(id) || !esRol(rol)) redirect(destino('usuarios', 'datos'));
  const { error } = await sb.rpc('actualizar_usuario', { p_usuario: id, p_rol: rol });
  terminar('usuarios', error, 'rol');
}

export async function cambiarEstado(form: FormData): Promise<void> {
  const { sb } = await comoAdministrador();
  const id = campo(form, 'id'), estado = campo(form, 'estado');
  if (!esUuid(id) || !esEstado(estado)) redirect(destino('usuarios', 'datos'));
  const { error } = await sb.rpc('actualizar_usuario', { p_usuario: id, p_estado: estado });
  terminar('usuarios', error, estado === 'suspendido' ? 'suspendida' : 'reactivada');
}

export async function guardarMarcas(form: FormData): Promise<void> {
  const { sb } = await comoAdministrador();
  const id = campo(form, 'id');
  if (!esUuid(id)) redirect(destino('usuarios', 'datos'));
  const { error } = await sb.rpc('actualizar_usuario', { p_usuario: id, p_marca_ids: normalizarIds(form.getAll('marca')) });
  terminar('usuarios', error, 'marcas');
}

export async function cambiarPermiso(form: FormData): Promise<void> {
  const { sb } = await comoAdministrador();
  const rol = campo(form, 'rol'), modulo = campo(form, 'modulo'), activo = campo(form, 'activo');
  if (!esRol(rol) || !esModulo(modulo) || (activo !== '1' && activo !== '0')) redirect(destino('permisos', 'datos'));
  if (activo === '0' && permisoFijo(rol, modulo)) redirect(destino('permisos', 'esencial'));
  const { error } = await sb.rpc('cambiar_permiso', { p_rol: rol, p_modulo: modulo, p_activo: activo === '1' });
  terminar('permisos', error, 'permiso');
}
