import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { exigirModulo } from '../../../../lib/sesion.ts';
import { clienteServidor } from '../../../../lib/supabase.ts';
import { cargarDetalle } from '../../../../lib/tablero-datos.ts';
import { ETIQUETA_ESTADO_TAREA, etiquetaFormato, fechaCorta, hace } from '../../../../lib/panel.ts';
import { AVISOS_TABLERO, CANALES, ETIQUETA_APROBACION, LIMITE, accionesDisponibles, destinoTablero, plazo } from '../../../../lib/tablero.ts';
import { esUuid } from '../../../../lib/usuarios.ts';
import { agregarComentario, decidirAprobacion, devolverADiseno, enviarARevision, publicarTarea, subirVersion } from '../../../../acciones/tablero.ts';
import { Aviso } from '../../../../componentes/Avisos';

export const metadata: Metadata = { title: 'Pieza del tablero' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

export default async function PaginaTarea({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const s = await exigirModulo('tablero');
  const sp = await searchParams;
  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const aviso = Object.hasOwn(AVISOS_TABLERO, codigo) ? AVISOS_TABLERO[codigo]! : undefined;

  const det = await cargarDetalle(await clienteServidor(), s.perfil.agenciaId, id.toLowerCase());
  if (!det) redirect(destinoTablero({ aviso: 'no-tarea' }));
  const { tarea: t } = det;
  const acciones = accionesDisponibles(s.perfil.rol, t);
  const ahora = new Date();
  const p = plazo(t, det.hoy);

  return (
    <section className="pagina ancha">
      <p className="enlaces-atras"><Link href="/tablero">← Tablero</Link></p>
      <div className="cabecera-panel">
        <div>
          <h1>{t.titulo}</h1>
          <p className="suave">{det.marca.nombre} · {etiquetaFormato(t.formato)}</p>
        </div>
        <div className="ficha-acciones">
          <span className={`etiqueta estado-${t.estado}`}>{ETIQUETA_ESTADO_TAREA[t.estado]}</span>
          {t.estado !== 'publicado' && t.aprobacion !== 'ninguna' && <span className="etiqueta etiqueta-info">{ETIQUETA_APROBACION[t.aprobacion]}</span>}
          {acciones.includes('editar') && <Link className="btn chico" href={`/tablero/${t.id}/editar`}>Editar</Link>}
        </div>
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <div className="rejilla rejilla-21">
        <div className="columna-doble">
          <article className="caja" aria-labelledby="h-resumen">
            <h2 id="h-resumen">Resumen</h2>
            <dl className="datos-ficha">
              <dt>Publicación</dt><dd className={p === 'atrasada' ? 'mala' : undefined}>{fechaCorta(t.fecha)}{p === 'atrasada' ? ' · atrasada' : p === 'hoy' ? ' · hoy' : ''}</dd>
              <dt>Responsable</dt><dd>{det.responsable ?? 'Sin responsable'}</dd>
              {det.creadaPor && <><dt>Creada por</dt><dd>{det.creadaPor}</dd></>}
              {det.publicacion && (
                <>
                  <dt>Publicada en</dt>
                  <dd>{det.publicacion.canal}{det.publicacion.url ? <> · <a href={det.publicacion.url} target="_blank" rel="noopener noreferrer">ver publicación</a></> : ''}</dd>
                </>
              )}
            </dl>
          </article>

          <article className="caja" aria-labelledby="h-versiones">
            <h2 id="h-versiones">Versiones</h2>
            {det.versiones.length === 0 ? <p className="vacio">Todavía no hay versiones. {acciones.includes('version') ? 'Sube la primera para poder enviarla a revisión.' : ''}</p> : (
              <ul className="filas">
                {det.versiones.map((v) => (
                  <li key={v.numero} className="fila">
                    <div className="fila-texto"><div className="fila-t">Versión {v.numero}{v.nota ? ` · ${v.nota}` : ''}</div><div className="fila-m">{v.autor ?? 'Alguien del equipo'} · {hace(v.creadoEn, ahora)}</div></div>
                  </li>
                ))}
              </ul>
            )}
            {acciones.includes('version') && (
              <form action={subirVersion} className="form en-fila">
                <input type="hidden" name="id" value={t.id} />
                <div className="campo crece"><label htmlFor="v-nota">Nota de la versión (opcional)</label><input id="v-nota" name="nota" maxLength={LIMITE.nota} autoComplete="off" placeholder="Ej. Ajuste de color en la portada" /></div>
                <button className="btn" type="submit">Subir versión</button>
              </form>
            )}
          </article>

          <article className="caja" aria-labelledby="h-comentarios">
            <h2 id="h-comentarios">Comentarios</h2>
            {det.comentarios.length === 0 ? <p className="vacio">Aún no hay comentarios.</p> : (
              <ul className="filas">
                {det.comentarios.map((c) => (
                  <li key={c.id} className="fila"><div className="fila-texto"><div className="fila-m">{c.viaEnlace ? 'Cliente (por enlace)' : c.autor ?? 'Alguien del equipo'} · {hace(c.creadoEn, ahora)}</div><p className="texto-largo">{c.texto}</p></div></li>
                ))}
              </ul>
            )}
            <form action={agregarComentario} className="form">
              <input type="hidden" name="id" value={t.id} />
              <div className="campo"><label htmlFor="c-texto">Escribe un comentario</label><textarea id="c-texto" name="texto" maxLength={LIMITE.comentario} rows={3} /></div>
              <div><button className="btn" type="submit">Comentar</button></div>
            </form>
          </article>
        </div>

        <aside className="columna-doble" aria-label="Acciones">
          {t.estado === 'publicado' ? (
            <div className="caja"><h2>Pieza publicada</h2><p className="suave">Ya no se mueve ni se edita. Puedes seguir comentando.</p></div>
          ) : (
            <div className="caja">
              <h2>Siguiente paso</h2>
              {acciones.includes('enviar') && (
                <form action={enviarARevision} className="form"><input type="hidden" name="id" value={t.id} />
                  <p className="suave">{det.versiones.length ? 'Cuando la versión esté lista, envíala al cliente para que la apruebe.' : 'Sube al menos una versión para poder enviarla a revisión.'}</p>
                  <div><button className="btn primario" type="submit">Enviar a revisión</button></div></form>
              )}
              {(acciones.includes('aprobar') || acciones.includes('cambios')) && (
                <form action={decidirAprobacion} className="form"><input type="hidden" name="id" value={t.id} />
                  <p className="suave">La pieza espera una decisión. Si pides cambios, explica cuáles.</p>
                  <div className="campo"><label htmlFor="d-comentario">Comentario</label><textarea id="d-comentario" name="comentario" maxLength={LIMITE.comentario} rows={3} /></div>
                  <div className="acciones-form"><button className="btn primario" type="submit" name="resultado" value="aprobada">Aprobar</button><button className="btn" type="submit" name="resultado" value="cambios">Pedir cambios</button></div></form>
              )}
              {acciones.includes('publicar') && (
                <form action={publicarTarea} className="form"><input type="hidden" name="id" value={t.id} />
                  <p className="suave">Cuando la publiques, confirma dónde salió. Alimenta los reportes.</p>
                  <div className="campo"><label htmlFor="p-canal">Canal *</label><select id="p-canal" name="canal" className="sel" defaultValue="Instagram">{CANALES.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div className="campo"><label htmlFor="p-url">Enlace a la publicación (opcional)</label><input id="p-url" name="url" type="url" maxLength={LIMITE.url} autoComplete="off" placeholder="https://" /></div>
                  <div><button className="btn primario" type="submit">Confirmar publicación</button></div></form>
              )}
              {acciones.includes('devolver') && (
                <form action={devolverADiseno} className="form"><input type="hidden" name="id" value={t.id} />
                  <p className="suave">{t.estado === 'aprobado' ? 'Si la pieza aprobada cambia, vuelve a diseño y necesitará una aprobación nueva.' : 'Si hace falta retocarla, vuelve a diseño y se cierra la ronda de revisión.'}</p>
                  <div><button className="btn" type="submit">Devolver a diseño</button></div></form>
              )}
              {acciones.filter((a) => a !== 'editar').length === 0 && <p className="suave">{t.estado === 'en_revision' ? 'Esperando la decisión del cliente.' : 'No tienes acciones disponibles para esta pieza.'}</p>}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
