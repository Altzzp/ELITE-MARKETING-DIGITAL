'use server';
// Apariencia: cada persona elige su tema (claro, oscuro o el del dispositivo). Solo cambia el suyo, a través de cambiar_tema (0009).
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { esTema } from '../lib/modulos.ts';

export async function guardarTema(form: FormData): Promise<void> {
  await exigirModulo('apariencia');
  const tema = form.get('tema');
  if (!esTema(tema)) redirect('/apariencia?e=datos');
  const { error } = await (await clienteServidor()).rpc('cambiar_tema', { p_tema: tema });
  if (error) { console.error('[apariencia] no se pudo guardar el tema', error.code ?? '(sin código)'); redirect('/apariencia?e=generico'); }
  revalidatePath('/', 'layout');   // el tema se pinta en el diseño general: que se vuelva a leer
  redirect('/apariencia?a=guardado');
}
