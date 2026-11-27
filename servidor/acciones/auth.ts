'use server';
// Acciones de acceso. Corren solo en el servidor; Next comprueba el origen de cada envío (protección CSRF).
// Ningún mensaje de error revela si una cuenta existe, y la contraseña nunca se devuelve al formulario.
import { redirect } from 'next/navigation';
import { clienteServidor, olvidarVerificadorPkce } from '../lib/supabase.ts';
import { cargarEstado, type Estado } from '../lib/sesion.ts';
import {
  MENSAJES, correoValido, mensajeAuth, nombreValido, normalizarCorreo, normalizarNombre, problemaDeClave, rutaSegura,
} from '../lib/seguridad.ts';
import { urlApp } from '../lib/web.ts';

export type EstadoForm = { error?: string; aviso?: string; correo?: string; nombre?: string } | undefined;

const campo = (f: FormData, k: string): string => { const v = f.get(k); return typeof v === 'string' ? v : ''; };
const motivoDeFallo = (e: Extract<Estado, { ok: false }>) =>
  e.motivo === 'suspendida' ? MENSAJES.suspendida : e.motivo === 'sin_perfil' ? MENSAJES.sinPerfil : MENSAJES.red;

export async function iniciarSesion(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = normalizarCorreo(campo(form, 'correo')), clave = campo(form, 'clave'), destino = rutaSegura(campo(form, 'next'));
  if (!correoValido(correo) || !clave) return { error: 'Escribe tu correo y tu contraseña.', correo };

  const sb = await clienteServidor();
  const { error } = await sb.auth.signInWithPassword({ email: correo, password: clave });
  if (error) return { error: mensajeAuth('login', error), correo };

  const estado = await cargarEstado(sb);
  if (!estado.ok) { await sb.auth.signOut({ scope: 'local' }); return { error: motivoDeFallo(estado), correo }; }
  redirect(destino);   // fuera de try/catch: redirect() funciona lanzando una excepción interna
}

export async function registrarse(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const nombre = normalizarNombre(campo(form, 'nombre')), correo = normalizarCorreo(campo(form, 'correo'));
  const clave = campo(form, 'clave'), repetida = campo(form, 'repetida');
  const eco = { correo, nombre };
  if (!nombreValido(nombre)) return { error: 'Escribe tu nombre completo.', ...eco };
  if (!correoValido(correo)) return { error: 'Escribe un correo válido: el mismo al que llegó tu invitación.', ...eco };
  const problema = problemaDeClave(clave, correo);
  if (problema) return { error: problema, ...eco };
  if (clave !== repetida) return { error: 'Las dos contraseñas no coinciden.', ...eco };

  const sb = await clienteServidor();
  const { data, error } = await sb.auth.signUp({
    email: correo, password: clave,
    options: { data: { nombre }, emailRedirectTo: `${urlApp()}/auth/confirmar` },
  });
  await olvidarVerificadorPkce();
  if (error) return { error: mensajeAuth('registro', error), ...eco };

  if (data.session) {   // el proyecto no exige confirmar el correo
    const estado = await cargarEstado(sb);
    if (!estado.ok) { await sb.auth.signOut({ scope: 'local' }); return { error: motivoDeFallo(estado), ...eco }; }
    redirect('/panel');
  }
  return { aviso: MENSAJES.registroEnviado };   // mismo texto exista o no la cuenta
}

export async function solicitarRecuperacion(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const correo = normalizarCorreo(campo(form, 'correo'));
  if (!correoValido(correo)) return { error: 'Escribe un correo válido.', correo };
  const sb = await clienteServidor();
  const { error } = await sb.auth.resetPasswordForEmail(correo, { redirectTo: `${urlApp()}/auth/confirmar` });
  await olvidarVerificadorPkce();
  // Solo se muestra un error si no depende de la cuenta (límite de envíos o falla del servicio); así no se puede averiguar qué correos existen.
  if (error && (error.status === 429 || error.status === 0 || (error.status ?? 0) >= 500 || error.name === 'AuthRetryableFetchError')) return { error: mensajeAuth('clave', error), correo };
  return { aviso: MENSAJES.recuperacion };
}

export async function cambiarClave(_previo: EstadoForm, form: FormData): Promise<EstadoForm> {
  const sb = await clienteServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login?e=enlace');
  const clave = campo(form, 'clave'), repetida = campo(form, 'repetida');
  const problema = problemaDeClave(clave, user.email ?? '');
  if (problema) return { error: problema };
  if (clave !== repetida) return { error: 'Las dos contraseñas no coinciden.' };
  const { error } = await sb.auth.updateUser({ password: clave });
  if (error) return { error: mensajeAuth('clave', error) };
  await sb.auth.signOut({ scope: 'others' });   // al cambiar la contraseña se cierran las demás sesiones abiertas
  redirect('/panel?e=clave');
}

/** Se llama desde la página intermedia de los enlaces de correo. Un botón (POST) y no un GET evita que los escáneres de correo gasten el enlace de un solo uso. */
export async function confirmarEnlace(form: FormData): Promise<void> {
  const tipo = campo(form, 'type'), hash = campo(form, 'token_hash');
  if (!['email', 'signup', 'recovery'].includes(tipo) || !/^[\w-]{10,200}$/.test(hash)) redirect('/login?e=enlace');
  const sb = await clienteServidor();
  const { error } = await sb.auth.verifyOtp({ type: tipo as 'email' | 'signup' | 'recovery', token_hash: hash });
  if (error) redirect('/login?e=enlace');
  if (tipo === 'recovery') redirect('/nueva-clave');
  const estado = await cargarEstado(sb);
  if (!estado.ok) { await sb.auth.signOut({ scope: 'local' }); redirect(`/login?e=${estado.motivo === 'suspendida' ? 'suspendida' : 'sinperfil'}`); }
  redirect(rutaSegura(campo(form, 'next')));
}

export async function cerrarSesion(): Promise<void> {
  const sb = await clienteServidor();
  await sb.auth.signOut({ scope: 'local' });
  redirect('/login?e=salio');
}
