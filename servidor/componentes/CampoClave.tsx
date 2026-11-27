'use client';
import { useState } from 'react';

/** Campo de contraseña con botón para mostrarla. Los atributos autoComplete permiten que el gestor de contraseñas funcione. */
export default function CampoClave({ name, etiqueta, autoComplete, ayuda }: { name: string; etiqueta: string; autoComplete: 'current-password' | 'new-password'; ayuda?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="campo">
      <label htmlFor={name}>{etiqueta}</label>
      <div className="clave">
        <input id={name} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required minLength={autoComplete === 'new-password' ? 10 : undefined}
          maxLength={200} aria-describedby={ayuda ? `${name}-ayuda` : undefined} autoCapitalize="none" spellCheck={false} />
        <button type="button" className="ojo" aria-pressed={visible} onClick={() => setVisible((v) => !v)}>{visible ? 'Ocultar' : 'Mostrar'}<span className="sr"> {etiqueta.toLowerCase()}</span></button>
      </div>
      {ayuda && <small id={`${name}-ayuda`}>{ayuda}</small>}
    </div>
  );
}
