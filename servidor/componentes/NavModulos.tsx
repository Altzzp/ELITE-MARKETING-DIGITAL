'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MODULOS, type ModuloId } from '../lib/modulos.ts';

export default function NavModulos({ modulos }: { modulos: ModuloId[] }) {
  const ruta = usePathname();
  const visibles = MODULOS.filter((m) => modulos.includes(m.id));
  return (
    <nav aria-label="Secciones" className="nav">
      <ul>
        {visibles.map((m) => {
          const activo = ruta === `/${m.id}` || ruta.startsWith(`/${m.id}/`);
          return <li key={m.id}><Link href={`/${m.id}`} aria-current={activo ? 'page' : undefined} className={activo ? 'activo' : ''}>{m.nombre}</Link></li>;
        })}
      </ul>
    </nav>
  );
}
