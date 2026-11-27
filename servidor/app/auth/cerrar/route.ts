// Cierre forzado: solo actúa si la sesión realmente no sirve (cuenta suspendida o sin perfil). Con una sesión válida no hace nada,
// así que otro sitio no puede usarlo para cerrarle la sesión a alguien.
import { NextResponse } from 'next/server';
import { clienteServidor } from '../../../lib/supabase.ts';
import { cargarEstado } from '../../../lib/sesion.ts';
import { urlApp } from '../../../lib/web.ts';

export const dynamic = 'force-dynamic';

export async function GET() {
  const base = urlApp();
  const sb = await clienteServidor();
  const estado = await cargarEstado(sb);
  if (estado.ok) return NextResponse.redirect(new URL('/panel', base));
  if (estado.motivo === 'error') return NextResponse.redirect(new URL('/login', base));
  if (estado.motivo !== 'sin_sesion') await sb.auth.signOut({ scope: 'local' });
  const codigo = estado.motivo === 'suspendida' ? 'suspendida' : estado.motivo === 'sin_perfil' ? 'sinperfil' : 'salio';
  return NextResponse.redirect(new URL(codigo === 'salio' ? '/login' : `/login?e=${codigo}`, base));
}
