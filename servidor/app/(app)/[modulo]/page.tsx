import { notFound } from 'next/navigation';
import { exigirModulo } from '../../../lib/sesion.ts';
import { MODULOS, esModulo } from '../../../lib/modulos.ts';
import { Aviso } from '../../../componentes/Avisos';

export async function generateMetadata({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params;
  return { title: MODULOS.find((m) => m.id === modulo)?.nombre ?? 'No encontrada' };
}

export default async function PaginaModulo({ params }: { params: Promise<{ modulo: string }> }) {
  const { modulo } = await params;
  if (!esModulo(modulo) || modulo === 'panel') notFound();
  await exigirModulo(modulo);   // si el rol no tiene este módulo, vuelve al panel con un aviso
  const m = MODULOS.find((x) => x.id === modulo);
  return (
    <section className="pagina">
      <h1>{m?.nombre}</h1>
      <p className="suave">{m?.descripcion}</p>
      <Aviso tipo="info">Esta sección todavía no está disponible en la plataforma. La verás aquí cuando se publique; mientras tanto, el resto de las secciones funcionan con normalidad.</Aviso>
    </section>
  );
}
