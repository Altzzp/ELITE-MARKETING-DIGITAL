import { exigirSesion } from '../../lib/sesion.ts';
import { ETIQUETA_ROL } from '../../lib/modulos.ts';
import { cerrarSesion } from '../../acciones/auth.ts';
import NavModulos from '../../componentes/NavModulos';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const s = await exigirSesion();
  const tema = s.perfil.tema === 'claro' ? 'light' : s.perfil.tema === 'oscuro' ? 'dark' : undefined;
  return (
    <div className="tema" data-theme={tema}>
      <a className="salto" href="#contenido">Saltar al contenido</a>
      <header className="barra">
        <div className="marca"><span className="logo" aria-hidden="true">É</span><div><b>Élite Digital Marketing</b><span>{s.agencia}</span></div></div>
        <div className="persona">
          <div className="datos"><b>{s.perfil.nombre}</b><span>{ETIQUETA_ROL[s.perfil.rol]}</span></div>
          <form action={cerrarSesion}><button className="btn" type="submit">Cerrar sesión</button></form>
        </div>
      </header>
      <div className="cuerpo">
        <NavModulos modulos={s.modulos} />
        <main id="contenido" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
