'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { iniciarSesion } from '../../../acciones/auth.ts';
import CampoClave from '../../../componentes/CampoClave';
import { Aviso } from '../../../componentes/Avisos';

export default function FormularioLogin({ next, aviso }: { next: string; aviso?: { tipo: 'ok' | 'error'; texto: string } | undefined }) {
  const [estado, accion, pendiente] = useActionState(iniciarSesion, undefined);
  return (
    <form action={accion} className="form" aria-busy={pendiente}>
      <h1>Iniciar sesión</h1>
      {aviso && !estado?.error && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <input type="hidden" name="next" value={next} />
      <div className="campo">
        <label htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" autoComplete="username" inputMode="email" required maxLength={254} autoCapitalize="none" spellCheck={false} defaultValue={estado?.correo ?? ''} />
      </div>
      <CampoClave name="clave" etiqueta="Contraseña" autoComplete="current-password" />
      <button className="btn primario" type="submit" disabled={pendiente}>{pendiente ? 'Entrando…' : 'Entrar'}</button>
      <p className="enlaces"><Link href="/recuperar">¿Olvidaste tu contraseña?</Link></p>
      <p className="enlaces suave">¿Te invitaron a la plataforma? <Link href="/registro">Crea tu cuenta</Link></p>
    </form>
  );
}
