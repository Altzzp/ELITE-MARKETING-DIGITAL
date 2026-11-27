import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { estadoSesion } from '../../../lib/sesion.ts';
import FormularioNuevaClave from './formulario';

export const metadata: Metadata = { title: 'Nueva contraseña' };

export default async function PaginaNuevaClave() {
  // Solo se llega desde el enlace del correo, que deja una sesión de recuperación. Sin sesión no hay nada que cambiar.
  const e = await estadoSesion();
  if (!e.ok && e.motivo === 'sin_sesion') redirect('/login?e=enlace');
  return <FormularioNuevaClave />;
}
