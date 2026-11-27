import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirModulo } from '../../../../lib/sesion.ts';
import { clienteServidor } from '../../../../lib/supabase.ts';
import { cargarMarcas } from '../../../../lib/marcas-datos.ts';
import { destinoMarcas, puedeCrearMarcas, valoresIniciales } from '../../../../lib/marcas.ts';
import { crearMarca } from '../../../../acciones/marcas.ts';
import FormularioMarca from '../../../../componentes/FormularioMarca';

export const metadata: Metadata = { title: 'Nueva marca' };

export default async function PaginaNuevaMarca() {
  const s = await exigirModulo('marcas');
  if (!puedeCrearMarcas(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'sin-permiso' }));
  const { clientes } = await cargarMarcas(await clienteServidor());
  return (
    <section className="pagina">
      <p className="enlaces-atras"><Link href="/marcas">← Información de marcas</Link></p>
      <h1>Nueva marca</h1>
      <p className="suave">Descríbela una vez: esta ficha alimenta las ideas, las plantillas y el asistente de IA. Lo único obligatorio es el nombre, el sector y el cliente.</p>
      <FormularioMarca modo="crear" accion={crearMarca} inicial={valoresIniciales(clientes.length > 0)} clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))} />
    </section>
  );
}
