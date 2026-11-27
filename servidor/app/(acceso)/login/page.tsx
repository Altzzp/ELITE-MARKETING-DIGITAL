import type { Metadata } from 'next';
import { AVISOS_LOGIN, rutaSegura } from '../../../lib/seguridad.ts';
import FormularioLogin from './formulario';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const codigo = typeof sp['e'] === 'string' ? sp['e'] : '';
  const aviso = Object.hasOwn(AVISOS_LOGIN, codigo) ? AVISOS_LOGIN[codigo] : undefined;   // solo textos de la lista, nunca el de la URL
  const next = typeof sp['next'] === 'string' ? rutaSegura(sp['next'], '') : '';
  return <FormularioLogin next={next} aviso={aviso} />;
}
