'use client';
import { useActionState } from 'react';
import Link from 'next/link';
import { registrarse } from '../../../acciones/auth.ts';
import CampoClave from '../../../componentes/CampoClave';
import { Aviso } from '../../../componentes/Avisos';

export default function FormularioRegistro() {
  const [estado, accion, pendiente] = useActionState(registrarse, undefined);
  if (estado?.aviso) {
    return (
      <div className="form">
        <h1>Revisa tu correo</h1>
        <Aviso tipo="ok">{estado.aviso}</Aviso>
        <p className="enlaces"><Link href="/login">Volver a iniciar sesión</Link></p>
      </div>
    );
  }
  return (
    <form action={accion} className="form" aria-busy={pendiente}>
      <h1>Crea tu cuenta</h1>
      <p className="suave">Solo para personas invitadas por la agencia. Usa el mismo correo al que llegó tu invitación.</p>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <div className="campo">
        <label htmlFor="nombre">Nombre completo</label>
        <input id="nombre" name="nombre" autoComplete="name" required minLength={2} maxLength={80} defaultValue={estado?.nombre ?? ''} />
      </div>
      <div className="campo">
        <label htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" autoComplete="username" inputMode="email" required maxLength={254} autoCapitalize="none" spellCheck={false} defaultValue={estado?.correo ?? ''} />
      </div>
      <CampoClave name="clave" etiqueta="Contraseña" autoComplete="new-password" ayuda="Mínimo 10 caracteres. Una frase larga es mejor que una palabra con símbolos." />
      <CampoClave name="repetida" etiqueta="Repite la contraseña" autoComplete="new-password" />
      <button className="btn primario" type="submit" disabled={pendiente}>{pendiente ? 'Creando…' : 'Crear cuenta'}</button>
      <p className="enlaces suave">¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link></p>
    </form>
  );
}
