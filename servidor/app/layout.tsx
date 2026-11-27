import type { Metadata } from 'next';
import { connection } from 'next/server';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Élite Digital Marketing', template: '%s · Élite Digital Marketing' },
  robots: { index: false, follow: false },   // herramienta interna: que no aparezca en buscadores
};

// Todas las páginas (también la 404) se generan en cada visita: la CSP lleva un nonce nuevo por petición y una página estática no puede tenerlo.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
