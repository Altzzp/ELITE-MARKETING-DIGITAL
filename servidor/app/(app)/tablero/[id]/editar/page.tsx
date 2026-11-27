import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirModulo } from '../../../../../lib/sesion.ts';
import { clienteServidor } from '../../../../../lib/supabase.ts';
import { cargarDetalle, disenadoresPorMarca } from '../../../../../lib/tablero-datos.ts';
import { destinoTablero, puedeEditarTareas, valoresDeTarea } from '../../../../../lib/tablero.ts';
import { esUuid } from '../../../../../lib/usuarios.ts';
import { editarTarea } from '../../../../../acciones/tablero.ts';
import FormularioTarea from '../../../../../componentes/FormularioTarea';

export const metadata: Metadata = { title: 'Editar tarea' };

export default async function PaginaEditarTarea({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const s = await exigirModulo('tablero');
  if (!puedeEditarTareas(s.perfil.rol)) redirect(destinoTablero({ id, aviso: 'sin-permiso' }));
  const sb = await clienteServidor();
  const det = await cargarDetalle(sb, s.perfil.agenciaId, id.toLowerCase());
  if (!det) redirect(destinoTablero({ aviso: 'no-tarea' }));
  if (det.tarea.estado === 'publicado') redirect(destinoTablero({ id: det.tarea.id, aviso: 'publicada-cerrada' }));
  const disenadores = (await disenadoresPorMarca(sb, [det.marca.id])).get(det.marca.id) ?? [];
  // Quien ya es responsable aparece en la lista aunque su acceso haya cambiado, para que editar no lo quite sin querer.
  if (det.tarea.responsableId && !disenadores.some((p) => p.id === det.tarea.responsableId)) disenadores.push({ id: det.tarea.responsableId, nombre: det.responsable ?? 'Responsable actual' });
  return (
    <section className="pagina">
      <p className="enlaces-atras"><Link href={`/tablero/${det.tarea.id}`}>← {det.tarea.titulo}</Link></p>
      <h1>Editar tarea</h1>
      <p className="suave">{det.marca.nombre}. Para mover la pieza de estado usa las acciones de su página.</p>
      <FormularioTarea modo="editar" accion={editarTarea} inicial={valoresDeTarea(det.tarea)} marcas={[]} disenadores={disenadores} puedeElegirResponsable tareaId={det.tarea.id} volver={`/tablero/${det.tarea.id}`} />
    </section>
  );
}
