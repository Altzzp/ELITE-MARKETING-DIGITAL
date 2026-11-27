'use server';
// Acciones de Ideas. Cada una exige sesión y el módulo, comprueba el rol, valida lo escrito y llama a una función de la base (0009) con la
// sesión de la persona; la base vuelve a comprobar rol y acceso a la marca. Siempre se redirige a /ideas con un código de aviso.
import { redirect } from 'next/navigation';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { esUuid } from '../lib/usuarios.ts';
import { destinoIdeas, codigoDeError, esFormato, LIMITE_IDEA, puedeCrearIdeas, puedeGestionarIdeas } from '../lib/ideas.ts';
import { fechaReal, fechaMaxima, MINIMA_FECHA } from '../lib/tablero.ts';

const campo = (f: FormData, k: string, multilinea = false): string => {
  const v = f.get(k);
  if (typeof v !== 'string') return '';
  const t = v.replace(/\r\n?/g, '\n');
  return (multilinea ? t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') : t.replace(/[\u0000-\u001F\u007F]/g, ' ')).trim();
};
const marcaDe = (f: FormData): string => { const m = campo(f, 'filtro').toLowerCase(); return esUuid(m) ? m : ''; };

function terminar(error: { code?: string; message?: string } | null, exito: string, marca: string): never {
  if (!error) redirect(destinoIdeas(exito, marca));
  const c = codigoDeError(error);
  if (c === 'generico') console.error('[ideas] error inesperado de la base de datos', error.code ?? '(sin código)');   // sin el mensaje: puede traer datos
  redirect(destinoIdeas(c, marca));
}

export async function crearIdea(form: FormData): Promise<void> {
  const s = await exigirModulo('ideas');
  const filtro = marcaDe(form);
  if (!puedeCrearIdeas(s.perfil.rol)) redirect(destinoIdeas('sin-permiso', filtro));
  const marca = campo(form, 'marca').toLowerCase(), titulo = campo(form, 'titulo'), descripcion = campo(form, 'descripcion', true), formato = campo(form, 'formato');
  if (!esUuid(marca)) redirect(destinoIdeas('marca', filtro));
  if (!titulo || titulo.length > LIMITE_IDEA.titulo) redirect(destinoIdeas('titulo', filtro));
  if (descripcion.length > LIMITE_IDEA.descripcion) redirect(destinoIdeas('descripcion', filtro));
  if (!esFormato(formato)) redirect(destinoIdeas('formato', filtro));
  terminar((await (await clienteServidor()).rpc('crear_idea', { p_marca: marca, p_titulo: titulo, p_formato: formato, p_descripcion: descripcion })).error, 'creada', filtro);
}

export async function cambiarEstadoIdea(form: FormData): Promise<void> {
  const s = await exigirModulo('ideas');
  const filtro = marcaDe(form), id = campo(form, 'id'), estado = campo(form, 'estado');
  if (!puedeGestionarIdeas(s.perfil.rol)) redirect(destinoIdeas('sin-permiso', filtro));
  if (!esUuid(id) || (estado !== 'borrador' && estado !== 'aprobada')) redirect(destinoIdeas('datos', filtro));
  terminar((await (await clienteServidor()).rpc('cambiar_estado_idea', { p_idea: id, p_estado: estado })).error, estado, filtro);
}

export async function descartarIdea(form: FormData): Promise<void> {
  const s = await exigirModulo('ideas');
  const filtro = marcaDe(form), id = campo(form, 'id');
  if (!puedeCrearIdeas(s.perfil.rol)) redirect(destinoIdeas('sin-permiso', filtro));
  if (!esUuid(id)) redirect(destinoIdeas('datos', filtro));
  terminar((await (await clienteServidor()).rpc('descartar_idea', { p_idea: id })).error, 'descartada', filtro);
}

export async function pasarAlTablero(form: FormData): Promise<void> {
  const s = await exigirModulo('ideas');
  const filtro = marcaDe(form), id = campo(form, 'id'), fecha = campo(form, 'fecha');
  if (!puedeCrearIdeas(s.perfil.rol)) redirect(destinoIdeas('sin-permiso', filtro));
  if (!esUuid(id)) redirect(destinoIdeas('datos', filtro));
  if (!fechaReal(fecha) || fecha < MINIMA_FECHA || fecha > fechaMaxima(new Date().toISOString().slice(0, 10))) redirect(destinoIdeas('fecha', filtro));
  const { data, error } = await (await clienteServidor()).rpc('convertir_idea_en_tarea', { p_idea: id, p_fecha: fecha, p_responsable: null });
  if (error) terminar(error, 'convertida', filtro);
  if (typeof data === 'string' && esUuid(data) && s.modulos.includes('tablero')) redirect(`/tablero/${data}?a=creada`);
  redirect(destinoIdeas('convertida', filtro));
}
