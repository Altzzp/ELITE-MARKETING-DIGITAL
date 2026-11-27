'use server';
// Acciones del Tablero. Cada una: (1) exige sesión y el módulo, (2) comprueba el rol, (3) valida los datos y (4) llama a una función de la base
// de datos (0003 y 0008) con la sesión de la persona. La autoridad final es la base: las comprobaciones de aquí solo evitan viajes inútiles y
// dan mensajes claros junto a cada campo. Next comprueba además el origen de cada envío (CSRF).
// Crear y editar devuelven los errores al formulario (conservando lo escrito); el resto redirige con un código de aviso.
import { redirect } from 'next/navigation';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { esUuid } from '../lib/usuarios.ts';
import { diaEnZona } from '../lib/panel.ts';
import {
  LIMITE, destinoTablero, leerFormTarea, puedeCrearTareas, puedeDecidir, puedeEditarTareas, puedeElegirResponsable, puedeMoverTareas, puedePublicar,
  puedeSubirVersion, traducirError, validarTarea, type EstadoFormTarea,
} from '../lib/tablero.ts';

const campo = (f: FormData, k: string): string => { const v = f.get(k); return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim() : ''; };

/** Termina una acción que redirige: éxito, o el aviso que corresponda al error de la base de datos. */
type Aviso = string;
function terminar(error: { code?: string; message?: string } | null, id: string, exito: Aviso): never {
  if (!error) redirect(destinoTablero({ id, aviso: exito }));
  const t = traducirError(error);
  const aviso: Aviso = 'aviso' in t ? t.aviso : 'datos';
  if (aviso === 'generico') console.error('[tablero] error inesperado de la base de datos', error.code ?? '(sin código)');   // sin el mensaje: puede traer datos
  redirect(destinoTablero({ id: aviso === 'no-tarea' ? null : id, aviso }));
}

async function hoyDeLaAgencia(sb: Awaited<ReturnType<typeof clienteServidor>>, agenciaId: string): Promise<string> {
  const { data } = await sb.from('agencias').select('zona_horaria').eq('id', agenciaId).maybeSingle();
  return diaEnZona(new Date(), (data as { zona_horaria?: string } | null)?.zona_horaria ?? 'UTC');
}

export async function crearTarea(_previo: EstadoFormTarea, form: FormData): Promise<EstadoFormTarea> {
  const s = await exigirModulo('tablero');
  if (!puedeCrearTareas(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const sb = await clienteServidor();
  const v = leerFormTarea(form);
  const { data: marcas, error: errorMarcas } = await sb.from('marcas').select('id').eq('activa', true).limit(500);
  if (errorMarcas) { console.error('[tablero] no se pudieron leer las marcas', errorMarcas.code ?? '(sin código)'); redirect(destinoTablero({ aviso: 'generico' })); }
  const ids = (marcas ?? []).map((m: { id: unknown }) => String(m.id).toLowerCase());
  const errores = validarTarea(v, 'crear', await hoyDeLaAgencia(sb, s.perfil.agenciaId), ids);
  if (Object.keys(errores).length) return { errores, valores: v };

  const { data, error } = await sb.rpc('crear_tarea', {
    p_marca: v.marca, p_titulo: v.titulo, p_formato: v.formato, p_fecha: v.fecha, p_responsable: puedeElegirResponsable(s.perfil.rol) && v.responsable ? v.responsable : null,
  });
  if (error) {
    const t = traducirError(error);
    if ('campo' in t) return { errores: { [t.campo]: t.texto }, valores: v };
    if (t.aviso === 'generico') console.error('[tablero] error inesperado al crear', error.code ?? '(sin código)');
    redirect(destinoTablero({ aviso: t.aviso }));
  }
  if (typeof data !== 'string' || !esUuid(data)) { console.error('[tablero] crear_tarea no devolvió un identificador'); redirect(destinoTablero({ aviso: 'generico' })); }
  redirect(destinoTablero({ id: data, aviso: 'creada' }));
}

export async function editarTarea(_previo: EstadoFormTarea, form: FormData): Promise<EstadoFormTarea> {
  const s = await exigirModulo('tablero');
  if (!puedeEditarTareas(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const id = campo(form, 'id');
  if (!esUuid(id)) redirect(destinoTablero({ aviso: 'datos' }));
  const v = leerFormTarea(form);
  const sb = await clienteServidor();
  const errores = validarTarea(v, 'editar', await hoyDeLaAgencia(sb, s.perfil.agenciaId));
  if (Object.keys(errores).length) return { errores, valores: v };
  const { error } = await sb.rpc('actualizar_tarea', { p_tarea: id, p_titulo: v.titulo, p_formato: v.formato, p_fecha: v.fecha, p_responsable: v.responsable || null });
  if (error) {
    const t = traducirError(error);
    if ('campo' in t) return { errores: { [t.campo]: t.texto }, valores: v };
    if (t.aviso === 'generico') console.error('[tablero] error inesperado al editar', error.code ?? '(sin código)');
    redirect(destinoTablero({ id: t.aviso === 'no-tarea' ? null : id, aviso: t.aviso }));
  }
  redirect(destinoTablero({ id, aviso: 'guardada' }));
}

const idDe = (form: FormData): string => { const id = campo(form, 'id'); if (!esUuid(id)) redirect(destinoTablero({ aviso: 'datos' })); return id; };

export async function enviarARevision(form: FormData): Promise<void> {
  const s = await exigirModulo('tablero');
  if (!puedeMoverTareas(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const id = idDe(form);
  terminar((await (await clienteServidor()).rpc('enviar_a_aprobacion', { p_tarea: id })).error, id, 'enviada');
}

export async function devolverADiseno(form: FormData): Promise<void> {
  const s = await exigirModulo('tablero');
  if (!puedeMoverTareas(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const id = idDe(form);
  terminar((await (await clienteServidor()).rpc('devolver_a_diseno', { p_tarea: id })).error, id, 'devuelta');
}

export async function decidirAprobacion(form: FormData): Promise<void> {
  const s = await exigirModulo('tablero');
  if (!puedeDecidir(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const id = idDe(form), resultado = campo(form, 'resultado'), comentario = campo(form, 'comentario').slice(0, LIMITE.comentario);
  if (resultado !== 'aprobada' && resultado !== 'cambios') redirect(destinoTablero({ id, aviso: 'datos' }));
  if (resultado === 'cambios' && !comentario) redirect(destinoTablero({ id, aviso: 'faltan-cambios' }));
  const { error } = await (await clienteServidor()).rpc('decidir_aprobacion', { p_tarea: id, p_resultado: resultado, p_comentario: comentario || null });
  terminar(error, id, resultado === 'aprobada' ? 'aprobada' : 'cambios-pedidos');
}

export async function publicarTarea(form: FormData): Promise<void> {
  const s = await exigirModulo('tablero');
  if (!puedePublicar(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const id = idDe(form), canal = campo(form, 'canal'), url = campo(form, 'url');
  if (!canal || canal.length > LIMITE.canal) redirect(destinoTablero({ id, aviso: 'canal' }));
  if (url && (url.length > LIMITE.url || !/^https?:\/\/[^\s<>"]+$/i.test(url))) redirect(destinoTablero({ id, aviso: 'enlace' }));
  terminar((await (await clienteServidor()).rpc('confirmar_publicacion', { p_tarea: id, p_canal: canal, p_url: url || null })).error, id, 'publicada');
}

export async function subirVersion(form: FormData): Promise<void> {
  const s = await exigirModulo('tablero');
  if (!puedeSubirVersion(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const id = idDe(form), nota = campo(form, 'nota');
  if (nota.length > LIMITE.nota) redirect(destinoTablero({ id, aviso: 'nota' }));
  terminar((await (await clienteServidor()).rpc('agregar_version', { p_tarea: id, p_nota: nota })).error, id, 'version');
}

export async function agregarComentario(form: FormData): Promise<void> {
  await exigirModulo('tablero');   // todos los roles con el módulo pueden comentar lo que ven; la base decide qué ven
  const id = idDe(form), texto = campo(form, 'texto');
  if (!texto || texto.length > LIMITE.comentario) redirect(destinoTablero({ id, aviso: 'comentario-vacio' }));
  terminar((await (await clienteServidor()).rpc('agregar_comentario', { p_tarea: id, p_texto: texto })).error, id, 'comentario');
}
