import type { Metadata } from 'next';
import Link from 'next/link';
import { confirmarEnlace } from '../../../acciones/auth.ts';
import { rutaSegura, MENSAJES } from '../../../lib/seguridad.ts';
import { Aviso } from '../../../componentes/Avisos';

export const metadata: Metadata = { title: 'Confirmar' };
export const dynamic = 'force-dynamic';

const TIPOS = { signup: 'Confirma tu correo para activar tu cuenta.', email: 'Confirma tu correo para activar tu cuenta.', recovery: 'Continúa para elegir una contraseña nueva.' } as const;

// Los enlaces de los correos llegan aquí. Se pide pulsar un botón antes de gastar el enlace (de un solo uso) para que los
// escáneres de correo, que abren los enlaces por su cuenta, no lo inutilicen.
export default async function PaginaConfirmar({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tipo = typeof sp['type'] === 'string' ? sp['type'] : '';
  const hash = typeof sp['token_hash'] === 'string' ? sp['token_hash'] : '';
  const valido = Object.hasOwn(TIPOS, tipo) && /^[\w-]{10,200}$/.test(hash);
  const next = typeof sp['next'] === 'string' ? rutaSegura(sp['next'], '') : '';
  return (
    <main className="acceso"><div className="tarjeta">
      <div className="marca"><span className="logo" aria-hidden="true">É</span><div><b>Élite Digital Marketing</b><span>Gestión de contenido</span></div></div>
      {valido ? (
        <form action={confirmarEnlace} className="form">
          <h1>Un último paso</h1>
          <p className="suave">{TIPOS[tipo as keyof typeof TIPOS]}</p>
          <input type="hidden" name="type" value={tipo} /><input type="hidden" name="token_hash" value={hash} /><input type="hidden" name="next" value={next} />
          <button className="btn primario" type="submit">Continuar</button>
        </form>
      ) : (
        <div className="form">
          <h1>Enlace no válido</h1>
          <Aviso tipo="error">{MENSAJES.enlaceInvalido}</Aviso>
          <p className="enlaces"><Link href="/login">Ir a iniciar sesión</Link></p>
        </div>
      )}
    </div></main>
  );
}
