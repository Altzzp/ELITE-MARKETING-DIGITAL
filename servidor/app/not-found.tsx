import Link from 'next/link';

export default function NoEncontrada() {
  return (
    <main className="acceso"><div className="tarjeta">
      <h1>Página no encontrada</h1>
      <p className="suave">La dirección no existe o ya no está disponible.</p>
      <Link className="btn primario" href="/panel">Ir al panel</Link>
    </div></main>
  );
}
