import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { cargarAcceso, cargarMarcas } from '../../../lib/marcas-datos.ts';
import { ETIQUETA_ROL } from '../../../lib/modulos.ts';
import { esUuid } from '../../../lib/usuarios.ts';
import {
  AVISOS_MARCAS, ETIQUETA_PESTANA, contrasteBajo, destinoMarcas, esPestanaMarca, pestanasVisibles, puedeArchivarMarcas, puedeCrearMarcas,
  puedeDarAcceso, puedeEditarFichas, puedeEliminarMarcas, type Marca, type PestanaMarca,
} from '../../../lib/marcas.ts';
import { archivarMarca, eliminarMarca, guardarAcceso } from '../../../acciones/marcas.ts';
import { Aviso } from '../../../componentes/Avisos';
import { AvatarMarca, FranjaPaleta, Muestra } from '../../../componentes/MarcasPartes';

export const metadata: Metadata = { title: 'Información de marcas' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

function VacioConAccion({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return <div className="vacio-ficha"><b>{titulo}</b>{children}</div>;
}

export default async function PaginaMarcas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('marcas');
  const sp = await searchParams;
  const rol = s.perfil.rol;
  const crear = puedeCrearMarcas(rol), editar = puedeEditarFichas(rol), archivar = puedeArchivarMarcas(rol), eliminar = puedeEliminarMarcas(rol), acceso = puedeDarAcceso(rol);

  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const aviso = Object.hasOwn(AVISOS_MARCAS, codigo) ? AVISOS_MARCAS[codigo]! : undefined;

  const sb = await clienteServidor();
  const { marcas: todas, clientes } = await cargarMarcas(sb);
  // Las archivadas solo las ve quien puede archivar (y restaurar); para el resto es como si no existieran.
  const activas = todas.filter((m) => m.activa), archivadas = archivar ? todas.filter((m) => !m.activa) : [];
  const visibles = [...activas, ...archivadas];

  const pedida = texto(sp, 'm').toLowerCase();
  const elegida: Marca | undefined = (esUuid(pedida) ? visibles.find((m) => m.id === pedida) : undefined) ?? activas[0] ?? archivadas[0];
  const permitidas = pestanasVisibles(rol);
  const pestanaPedida = texto(sp, 'pestana');
  const pestana: PestanaMarca = esPestanaMarca(pestanaPedida) && permitidas.includes(pestanaPedida) ? pestanaPedida : 'general';

  const nombreCliente = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? '';
  const botonNueva = crear && <Link className="btn primario" href="/marcas/nueva">Nueva marca</Link>;

  const datosAcceso = elegida && pestana === 'acceso' && acceso ? await cargarAcceso(sb, elegida.id) : null;

  const tarjeta = (m: Marca) => (
    <li key={m.id}>
      <Link href={destinoMarcas({ marca: m.id })} className="marca-tarjeta" aria-current={m.id === elegida?.id ? 'true' : undefined}>
        <span className="marca-tarjeta-cab">
          <AvatarMarca marca={m} />
          <span className="marca-tarjeta-texto"><b>{m.nombre}</b><small>{m.sector || '—'}</small></span>
        </span>
        <FranjaPaleta paleta={m.paleta} />
        {!m.activa && <span className="etiqueta etiqueta-aviso">Archivada</span>}
      </Link>
    </li>
  );

  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Información de marcas</h1>
          <p className="suave">La ficha de cada marca: identidad, tono, redes y brief. Es la base que usan las ideas, las plantillas y la IA.</p>
        </div>
        {botonNueva}
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {!elegida ? (
        <div className="caja">
          <VacioConAccion titulo={crear ? 'Aún no hay marcas' : 'No tienes marcas asignadas'}>
            <p className="suave">{crear ? 'Crea la primera: con su identidad, tono y redes alimenta las ideas, las plantillas y la IA.' : 'Pide a un Administrador que te dé acceso a una marca.'}</p>
            {botonNueva}
          </VacioConAccion>
        </div>
      ) : (
        <>
          <ul className="marca-rejilla" aria-label="Marcas">{activas.map(tarjeta)}</ul>
          {archivadas.length > 0 && (
            <>
              <h2>Archivadas</h2>
              <ul className="marca-rejilla" aria-label="Marcas archivadas">{archivadas.map(tarjeta)}</ul>
            </>
          )}

          <article className="caja ficha" aria-labelledby="ficha-titulo">
            <header className="ficha-cab">
              <AvatarMarca marca={elegida} tam={48} />
              <div className="ficha-titulo">
                <h2 id="ficha-titulo">{elegida.nombre}</h2>
                <span className="suave">{[nombreCliente(elegida.clienteId), elegida.sector].filter(Boolean).join(' · ') || '—'}</span>
              </div>
              <div className="ficha-acciones">
                {!elegida.activa && <span className="etiqueta etiqueta-aviso">Archivada</span>}
                {editar && elegida.activa && <Link className="btn chico" href={`/marcas/${elegida.id}/editar`}>Editar</Link>}
                {archivar && (
                  <form action={archivarMarca}>
                    <input type="hidden" name="id" value={elegida.id} />
                    <input type="hidden" name="archivada" value={elegida.activa ? '1' : '0'} />
                    <button className="btn chico" type="submit">{elegida.activa ? 'Archivar' : 'Restaurar'}</button>
                  </form>
                )}
              </div>
            </header>

            <nav className="pestanas" aria-label={`Secciones de la ficha de ${elegida.nombre}`}>
              {permitidas.map((p) => <Link key={p} href={destinoMarcas({ marca: elegida.id, pestana: p })} aria-current={pestana === p ? 'page' : undefined}>{ETIQUETA_PESTANA[p]}</Link>)}
            </nav>

            <div className="ficha-cuerpo">
              {pestana === 'general' && (
                <dl className="datos-ficha">
                  <dt>Cliente</dt>
                  <dd>{nombreCliente(elegida.clienteId) || '—'}{clientes.find((c) => c.id === elegida.clienteId)?.contacto ? ` · contacto ${clientes.find((c) => c.id === elegida.clienteId)!.contacto}` : ''}</dd>
                  <dt>Sector</dt><dd>{elegida.sector || '—'}</dd>
                  <dt>Nombre corto</dt><dd>{elegida.corto}</dd>
                  {(() => {
                    const hermanas = visibles.filter((m) => m.clienteId === elegida.clienteId && m.id !== elegida.id);
                    return hermanas.length ? <><dt>Otras marcas del cliente</dt><dd className="chips">{hermanas.map((m) => <Link key={m.id} className="chip" href={destinoMarcas({ marca: m.id })}>{m.nombre}</Link>)}</dd></> : null;
                  })()}
                  <dt>Estado</dt><dd>{elegida.activa ? 'Activa' : 'Archivada: no aparece en el Panel ni en el trabajo diario, pero conserva su historial.'}</dd>
                </dl>
              )}

              {pestana === 'identidad' && (
                <div className="ficha-bloques">
                  {contrasteBajo(elegida.paleta) && <Aviso tipo="info">El color principal y el fondo claro casi no se distinguen: los títulos de las portadas serían difíciles de leer.</Aviso>}
                  <div>
                    <h3 className="rotulo">Paleta de colores</h3>
                    {elegida.paleta.length ? <div className="muestras">{elegida.paleta.map((p, i) => <Muestra key={`${p.hex}-${i}`} nombre={p.nombre || `Color ${i + 1}`} hex={p.hex} />)}</div> : <p className="suave">Esta marca aún no tiene colores.</p>}
                  </div>
                  <div>
                    <h3 className="rotulo">Tipografías</h3>
                    <dl className="datos-ficha"><dt>Títulos</dt><dd><b>{elegida.tipografias.titulos}</b></dd><dt>Textos</dt><dd><b>{elegida.tipografias.textos}</b></dd></dl>
                  </div>
                </div>
              )}

              {pestana === 'comunicacion' && (elegida.tono || elegida.publico ? (
                <dl className="datos-ficha"><dt>Tono de comunicación</dt><dd>{elegida.tono || '—'}</dd><dt>Público objetivo</dt><dd className="texto-largo">{elegida.publico || '—'}</dd></dl>
              ) : (
                <VacioConAccion titulo="Aún no hay descripción">
                  <p className="suave">Define el tono y el público para que las ideas y la IA hablen como la marca.</p>
                  {editar && elegida.activa && <Link className="btn" href={`/marcas/${elegida.id}/editar`}>Describir la marca</Link>}
                </VacioConAccion>
              ))}

              {pestana === 'redes' && (elegida.redes.length ? (
                <ul className="filas">{elegida.redes.map((r) => <li key={r.red} className="fila"><div className="fila-texto"><div className="fila-t">{r.red}</div><div className="fila-m">{r.usuario}</div></div></li>)}</ul>
              ) : (
                <VacioConAccion titulo="Sin redes registradas">
                  <p className="suave">Agrega las cuentas de la marca para tenerlas a la mano al planificar.</p>
                  {editar && elegida.activa && <Link className="btn" href={`/marcas/${elegida.id}/editar`}>Agregar redes</Link>}
                </VacioConAccion>
              ))}

              {pestana === 'brief' && (elegida.brief ? <p className="texto-largo">{elegida.brief}</p> : (
                <VacioConAccion titulo="Aún no hay brief">
                  <p className="suave">Resume qué vende la marca, qué la diferencia y qué se debe evitar.</p>
                  {editar && elegida.activa && <Link className="btn" href={`/marcas/${elegida.id}/editar`}>Escribir el brief</Link>}
                </VacioConAccion>
              ))}

              {pestana === 'acceso' && datosAcceso && (
                <div className="ficha-bloques">
                  <p className="suave">Administrador y Dirección ven todas las marcas. Marca quién más puede ver esta; al guardar, la lista se reemplaza.</p>
                  {datosAcceso.personas.length === 0 ? <p className="suave">Todavía no hay personas de equipo ni clientes. Invítalas en Usuarios y roles.</p> : (
                    <form action={guardarAcceso} className="form">
                      <input type="hidden" name="id" value={elegida.id} />
                      <fieldset className="campo">
                        <legend>Personas con acceso a {elegida.nombre}</legend>
                        <div className="chips">
                          {datosAcceso.personas.map((p) => (
                            <label key={p.id} className="chip"><input type="checkbox" className="cb" name="persona" value={p.id} defaultChecked={datosAcceso.conAcceso.has(p.id)} /> {p.nombre} · {ETIQUETA_ROL[p.rol]}{p.activa ? '' : ' (suspendida)'}</label>
                          ))}
                        </div>
                      </fieldset>
                      <div><button className="btn primario" type="submit">Guardar acceso</button></div>
                    </form>
                  )}
                </div>
              )}
            </div>

            {eliminar && (
              <details className="plegable chico peligro">
                <summary>Eliminar esta marca…</summary>
                <form action={eliminarMarca} className="form">
                  <p className="suave">Solo se puede eliminar una marca vacía (sin piezas, ideas, proyectos, conversaciones ni archivos). Si ya tiene trabajo, archívala: se conserva su historial. El cliente no se elimina.</p>
                  <input type="hidden" name="id" value={elegida.id} />
                  <label className="chip"><input type="checkbox" className="cb" name="confirmar" value="si" /> Entiendo que {elegida.nombre} se eliminará para siempre</label>
                  <div><button className="btn chico peligro-btn" type="submit">Eliminar marca</button></div>
                </form>
              </details>
            )}
          </article>
        </>
      )}
    </section>
  );
}
