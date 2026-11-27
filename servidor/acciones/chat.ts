'use server';
// Acciones del Chat de IA: abrir una conversación y guardar una propuesta como idea. Enviar mensajes no pasa por aquí: lo hace la ruta /api/ia.
import { redirect } from 'next/navigation';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { esUuid } from '../lib/usuarios.ts';
import { codigoDeErrorChat, destinoChat, esModo, esProveedor, puedeUsarChat } from '../lib/chat.ts';

const campo = (f: FormData, k: string): string => { const v = f.get(k); return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim() : ''; };

export async function nuevaConversacion(form: FormData): Promise<void> {
  const s = await exigirModulo('chat');
  if (!puedeUsarChat(s.perfil.rol)) redirect(destinoChat(undefined, 'sin-permiso'));
  const marca = campo(form, 'marca').toLowerCase(), proveedor = campo(form, 'proveedor'), modo = campo(form, 'modo');
  if (!esUuid(marca)) redirect(destinoChat(undefined, 'marca'));
  if (!esProveedor(proveedor) || !esModo(modo)) redirect(destinoChat(undefined, 'datos'));
  const { data, error } = await (await clienteServidor()).rpc('crear_conversacion', { p_marca: marca, p_proveedor: proveedor, p_modo: modo, p_titulo: campo(form, 'titulo').slice(0, 120) });
  if (error) {
    const c = codigoDeErrorChat(error);
    if (c === 'generico') console.error('[chat] error inesperado al crear la conversación', error.code ?? '(sin código)');
    redirect(destinoChat(undefined, c));
  }
  if (typeof data !== 'string' || !esUuid(data)) { console.error('[chat] crear_conversacion no devolvió un identificador'); redirect(destinoChat(undefined, 'generico')); }
  redirect(destinoChat(data));
}

export async function guardarComoIdea(form: FormData): Promise<void> {
  const s = await exigirModulo('chat');
  const conv = campo(form, 'conversacion').toLowerCase(), mensaje = campo(form, 'mensaje').toLowerCase(), indice = Number(campo(form, 'indice'));
  if (!puedeUsarChat(s.perfil.rol)) redirect(destinoChat(undefined, 'sin-permiso'));
  if (!esUuid(conv) || !esUuid(mensaje) || !Number.isInteger(indice) || indice < 0 || indice > 50) redirect(destinoChat(esUuid(conv) ? conv : undefined, 'datos'));
  const { error } = await (await clienteServidor()).rpc('guardar_idea_de_mensaje', { p_mensaje: mensaje, p_indice: indice });
  if (error) {
    const c = codigoDeErrorChat(error);
    if (c === 'generico') console.error('[chat] error inesperado al guardar la idea', error.code ?? '(sin código)');
    redirect(destinoChat(conv, c));
  }
  redirect(destinoChat(conv, 'idea-guardada'));
}
