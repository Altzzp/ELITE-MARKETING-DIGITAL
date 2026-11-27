'use client';
import { useActionState } from 'react';
import { cambiarClave } from '../../../acciones/auth.ts';
import CampoClave from '../../../componentes/CampoClave';
import { Aviso } from '../../../componentes/Avisos';

export default function FormularioNuevaClave() {
  const [estado, accion, pendiente] = useActionState(cambiarClave, undefined);
  return (
    <form action={accion} className="form" aria-busy={pendiente}>
      <h1>Elige una contraseña nueva</h1>
      {estado?.error && <Aviso tipo="error">{estado.error}</Aviso>}
      <CampoClave name="clave" etiqueta="Contraseña nueva" autoComplete="new-password" ayuda="Mínimo 10 caracteres. Se cerrarán tus otras sesiones abiertas." />
      <CampoClave name="repetida" etiqueta="Repite la contraseña" autoComplete="new-password" />
      <button className="btn primario" type="submit" disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
  );
}
