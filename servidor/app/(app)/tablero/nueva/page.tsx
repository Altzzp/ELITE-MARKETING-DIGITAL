import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirModulo } from '../../../../lib/sesion.ts';
import { clienteServidor } from '../../../../lib/supabase.ts';
import { cargarTablero } from '../../../../lib/tablero-datos.ts';
import { destinoTablero, puedeCrearTareas, puedeElegirResponsable } from '../../../../lib/tablero.ts';
import { crearTarea } from '../../../../acciones/tablero.ts';
import FormularioTarea from '../../../../componentes/FormularioTarea';

export const metadata: Metadata = { title: 'Nueva tarea' };

export default async function PaginaNuevaTarea({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('tablero');
  if (!puedeCrearTareas(s.perfil.rol)) redirect(destinoTablero({ aviso: 'sin-permiso' }));
  const d = await cargarTablero(await clienteServidor(), s.perfil.agenciaId);
  if (d.marcas.length === 0) redirect(destinoTablero({ aviso: 'no-marca' }));
  const sp = await searchParams;
  const pedida = typeof sp['marca'] === 'string' ? sp['marca'].toLowerCase() : '';
  const marca = d.marcas.find((m) => m.id === pedida)?.id ?? (d.marcas.length === 1 ? d.marcas[0]!.id : '');
  return (
    <section className="pagina">
      <p className="enlaces-atras"><Link href="/tablero">← Tablero</Link></p>
      <h1>Nueva tarea</h1>
      <FormularioTarea modo="crear" accion={crearTarea} inicial={{ marca, titulo: '', formato: '', fecha: '', responsable: '' }} marcas={d.marcas} disenadores={d.disenadores}
        puedeElegirResponsable={puedeElegirResponsable(s.perfil.rol)} volver="/tablero" />
    </section>
  );
}
