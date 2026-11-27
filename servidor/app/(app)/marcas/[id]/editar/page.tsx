import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirModulo } from '../../../../../lib/sesion.ts';
import { clienteServidor } from '../../../../../lib/supabase.ts';
import { cargarMarcas } from '../../../../../lib/marcas-datos.ts';
import { destinoMarcas, puedeEditarFichas, valoresDeMarca } from '../../../../../lib/marcas.ts';
import { esUuid } from '../../../../../lib/usuarios.ts';
import { editarMarca } from '../../../../../acciones/marcas.ts';
import FormularioMarca from '../../../../../componentes/FormularioMarca';

export const metadata: Metadata = { title: 'Editar marca' };

export default async function PaginaEditarMarca({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const s = await exigirModulo('marcas');
  if (!puedeEditarFichas(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'sin-permiso' }));
  const { marcas, clientes } = await cargarMarcas(await clienteServidor());
  const marca = marcas.find((m) => m.id === id.toLowerCase());
  if (!marca) redirect(destinoMarcas({ aviso: 'no-marca' }));   // no existe o no la tiene asignada
  if (!marca.activa) redirect(destinoMarcas({ marca: marca.id, aviso: 'marca-archivada' }));   // una marca archivada primero se restaura
  return (
    <section className="pagina">
      <p className="enlaces-atras"><Link href={destinoMarcas({ marca: marca.id })}>← {marca.nombre}</Link></p>
      <h1>Editar {marca.nombre}</h1>
      <FormularioMarca modo="editar" accion={editarMarca} inicial={valoresDeMarca(marca)} clientes={[]} marcaId={marca.id} clienteActual={clientes.find((c) => c.id === marca.clienteId)?.nombre ?? ''} />
    </section>
  );
}
