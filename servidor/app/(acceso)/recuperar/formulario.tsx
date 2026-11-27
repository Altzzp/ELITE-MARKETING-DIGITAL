'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { solicitarRecuperacion } from '../../../acciones/auth.ts';
import { Aviso } from '../../../componentes/Avisos';

export default function FormularioRecuperar() {
  const [estado, accion, pendiente] = useActionState(solicitarRecuperacion, undefined);
  return (
    <form action={accion} className="form" aria-busy={pendiente}>
      <h1>Recuperar contraseña</h1>
      <p className="suave">Escribe tu correo y te enviaremos un enlace para elegir una contraseña nueva.</p>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      {estado?.aviso && <Aviso tipo="ok">{estado.aviso}</Aviso>}
      <div className="campo">
        <label htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" autoComplete="username" inputMode="email" required maxLength={254} autoCapitalize="none" spellCheck={false} defaultValue={estado?.correo ?? ''} />
      </div>
      <button className="btn primario" type="submit" disabled={pendiente}>{pendiente ? 'Enviando…' : 'Enviar enlace'}</button>
      <p className="enlaces"><Link href="/login">Volver a iniciar sesión</Link></p>
    </form>
  );
}
