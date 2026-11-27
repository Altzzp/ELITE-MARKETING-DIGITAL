'use server';
// Decidir una pieza desde Aprobaciones: aprobarla o pedir cambios. Exige sesión y el módulo, comprueba el rol y llama a `decidir_aprobacion` (0003)
// con la sesión de la persona: la base decide si esa pieza es visible para ella y está esperando una decisión. Redirige con un código de aviso.
import { redirect } from 'next/navigation';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { esUuid } from '../lib/usuarios.ts';
import { LIMITE, traducirError } from '../lib/tablero.ts';
import { destinoAprobaciones, puedeDecidirAqui } from '../lib/aprobaciones.ts';

const campo = (f: FormData, k: string): string => { const v = f.get(k); return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim() : ''; };

export async function decidirDesdeAprobaciones(form: FormData): Promise<void> {
  const s = await exigirModulo('aprobaciones');
  if (!puedeDecidirAqui(s.perfil.rol)) redirect(destinoAprobaciones('sin-permiso'));
  const id = campo(form, 'id'), resultado = campo(form, 'resultado'), comentario = campo(form, 'comentario').slice(0, LIMITE.comentario);
  if (!esUuid(id) || (resultado !== 'aprobada' && resultado !== 'cambios')) redirect(destinoAprobaciones('datos'));
  if (resultado === 'cambios' && !comentario) redirect(destinoAprobaciones('faltan-cambios'));
  const { error } = await (await clienteServidor()).rpc('decidir_aprobacion', { p_tarea: id, p_resultado: resultado, p_comentario: comentario || null });
  if (!error) redirect(destinoAprobaciones(resultado === 'aprobada' ? 'aprobada' : 'cambios-pedidos'));
  const t = traducirError(error);
  const aviso = 'aviso' in t ? t.aviso : 'datos';
  if (aviso === 'generico') console.error('[aprobaciones] error inesperado de la base de datos', error.code ?? '(sin código)');   // sin el mensaje: puede traer datos
  redirect(destinoAprobaciones(aviso));
}
