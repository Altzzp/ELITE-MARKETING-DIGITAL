'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="acceso"><div className="tarjeta">
      <h1>Algo salió mal</h1>
      <p className="suave">No pudimos cargar esta pantalla. Inténtalo de nuevo; si sigue pasando, avisa al administrador.</p>
      <button className="btn primario" onClick={reset}>Reintentar</button>
    </div></main>
  );
}
