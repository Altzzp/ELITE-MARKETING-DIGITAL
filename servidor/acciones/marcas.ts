'use server';
// Acciones de "Información de marcas". Cada una: (1) exige sesión y el módulo, (2) comprueba el rol, (3) valida los datos y
// (4) llama a una función de la base de datos (0007) con la sesión de la persona. La autoridad final es la base: las comprobaciones
// de aquí solo evitan viajes inútiles y dan mensajes claros junto a cada campo. Next comprueba además el origen de cada envío (CSRF).
// Crear y editar devuelven los errores al formulario (conservando lo escrito); el resto redirige a /marcas con un código de aviso.
import { redirect } from 'next/navigation';
import { clienteServidor } from '../lib/supabase.ts';
import { exigirModulo } from '../lib/sesion.ts';
import { esUuid, normalizarIds } from '../lib/usuarios.ts';
import {
  CLIENTE_NUEVO, argumentosFicha, destinoMarcas, leerFicha, puedeArchivarMarcas, puedeCrearMarcas, puedeDarAcceso, puedeEditarFichas,
  puedeEliminarMarcas, traducirError, validarFicha, type EstadoFormulario,
} from '../lib/marcas.ts';

const campo = (f: FormData, k: string): string => { const v = f.get(k); return typeof v === 'string' ? v.trim() : ''; };

/** Termina una acción que redirige: éxito, o el aviso que corresponda al error de la base de datos. */
type Destino = Parameters<typeof destinoMarcas>[0];
function terminar(error: { code?: string; message?: string } | null, exito: Destino, marcaSiFalla: string | null): never {
  if (!error) redirect(destinoMarcas(exito));
  const t = traducirError(error);
  if ('aviso' in t && t.aviso === 'generico') console.error('[marcas] error inesperado de la base de datos', error.code ?? '(sin código)');   // sin el mensaje: puede traer datos
  redirect(destinoMarcas({ marca: marcaSiFalla, aviso: 'aviso' in t ? t.aviso : 'datos' }));
}

export async function crearMarca(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const s = await exigirModulo('marcas');
  if (!puedeCrearMarcas(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'sin-permiso' }));
  const sb = await clienteServidor();
  const v = leerFicha(form);
  const { data: clientes, error: errorClientes } = await sb.from('clientes').select('id').limit(500);
  if (errorClientes) { console.error('[marcas] no se pudieron leer los clientes', errorClientes.code ?? '(sin código)'); redirect(destinoMarcas({ aviso: 'generico' })); }
  const ids = (clientes ?? []).map((c: { id: unknown }) => String(c.id).toLowerCase());
  const errores = validarFicha(v, 'crear', ids);
  if (Object.keys(errores).length) return { errores, valores: v };

  const nuevo = v.cliente === CLIENTE_NUEVO;
  const { data, error } = await sb.rpc('crear_marca', {
    ...argumentosFicha(v),
    p_cliente: nuevo ? null : v.cliente, p_cliente_nuevo: nuevo ? v.clienteNuevo : null, p_cliente_contacto: nuevo ? v.clienteContacto : null,
  });
  if (error) {
    const t = traducirError(error);
    if ('campo' in t) return { errores: { [t.campo]: t.texto }, valores: v };
    if (t.aviso === 'generico') console.error('[marcas] error inesperado al crear', error.code ?? '(sin código)');
    redirect(destinoMarcas({ aviso: t.aviso }));
  }
  if (typeof data !== 'string' || !esUuid(data)) { console.error('[marcas] crear_marca no devolvió un identificador'); redirect(destinoMarcas({ aviso: 'generico' })); }
  redirect(destinoMarcas({ marca: data, aviso: s.perfil.rol === 'administrador' ? 'creada' : 'creada-sin-acceso' }));
}

export async function editarMarca(_previo: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const s = await exigirModulo('marcas');
  if (!puedeEditarFichas(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'sin-permiso' }));
  const id = campo(form, 'id');
  if (!esUuid(id)) redirect(destinoMarcas({ aviso: 'datos' }));
  const v = leerFicha(form);
  const errores = validarFicha(v, 'editar');
  if (Object.keys(errores).length) return { errores, valores: v };

  const sb = await clienteServidor();
  const { error } = await sb.rpc('actualizar_marca', { p_marca: id, ...argumentosFicha(v) });
  if (error) {
    const t = traducirError(error);
    if ('campo' in t) return { errores: { [t.campo]: t.texto }, valores: v };
    if (t.aviso === 'generico') console.error('[marcas] error inesperado al editar', error.code ?? '(sin código)');
    redirect(destinoMarcas({ aviso: t.aviso }));
  }
  redirect(destinoMarcas({ marca: id, aviso: 'guardada' }));
}

export async function archivarMarca(form: FormData): Promise<void> {
  const s = await exigirModulo('marcas');
  if (!puedeArchivarMarcas(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'sin-permiso' }));
  const id = campo(form, 'id'), archivada = campo(form, 'archivada');
  if (!esUuid(id) || (archivada !== '1' && archivada !== '0')) redirect(destinoMarcas({ aviso: 'datos' }));
  const { error } = await (await clienteServidor()).rpc('archivar_marca', { p_marca: id, p_archivada: archivada === '1' });
  terminar(error, { marca: id, aviso: archivada === '1' ? 'archivada' : 'restaurada' }, id);
}

export async function eliminarMarca(form: FormData): Promise<void> {
  const s = await exigirModulo('marcas');
  if (!puedeEliminarMarcas(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'solo-admin' }));
  const id = campo(form, 'id');
  if (!esUuid(id)) redirect(destinoMarcas({ aviso: 'datos' }));
  if (campo(form, 'confirmar') !== 'si') redirect(destinoMarcas({ marca: id, aviso: 'confirmar' }));
  const { error } = await (await clienteServidor()).rpc('eliminar_marca', { p_marca: id });
  terminar(error, { aviso: 'eliminada' }, id);
}

export async function guardarAcceso(form: FormData): Promise<void> {
  const s = await exigirModulo('marcas');
  if (!puedeDarAcceso(s.perfil.rol)) redirect(destinoMarcas({ aviso: 'solo-admin' }));
  const id = campo(form, 'id');
  if (!esUuid(id)) redirect(destinoMarcas({ aviso: 'datos' }));
  const { error } = await (await clienteServidor()).rpc('asignar_marca', { p_marca: id, p_usuarios: normalizarIds(form.getAll('persona')) });
  terminar(error, { marca: id, pestana: 'acceso', aviso: 'acceso' }, id);
}
