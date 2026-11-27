// La CSP lleva un nonce distinto en cada petición: las páginas tienen que generarse en cada visita (una página estática no puede llevarlo).
export const dynamic = 'force-dynamic';

export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <main className="acceso">
      <div className="tarjeta">
        <div className="marca" aria-hidden="false">
          <span className="logo" aria-hidden="true">É</span>
          <div><b>Élite Digital Marketing</b><span>Gestión de contenido</span></div>
        </div>
        {children}
      </div>
    </main>
  );
}
