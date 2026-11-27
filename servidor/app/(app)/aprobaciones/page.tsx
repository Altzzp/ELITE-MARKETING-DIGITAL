import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { cargarAprobaciones, type DatosAprobaciones } from '../../../lib/aprobaciones-datos.ts';
import { etiquetaFormato, fechaCorta, hace } from '../../../lib/panel.ts';
import { AVISOS_APROBACIONES, ETIQUETA_RESULTADO, puedeDecidirAqui } from '../../../lib/aprobaciones.ts';
import { LIMITE, plazo } from '../../../lib/tablero.ts';
import { decidirDesdeAprobaciones } from '../../../acciones/aprobaciones.ts';
import { Aviso } from '../../../componentes/Avisos';

export const metadata: Metadata = { title: 'Aprobaciones' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

export default async function PaginaAprobaciones({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('aprobaciones');
  const sp = await searchParams;
  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const aviso = Object.hasOwn(AVISOS_APROBACIONES, codigo) ? AVISOS_APROBACIONES[codigo]! : undefined;
  const decide = puedeDecidirAqui(s.perfil.rol), veTablero = s.modulos.includes('tablero');

  let d: DatosAprobaciones | null = null;
  try { d = await cargarAprobaciones(await clienteServidor(), s.perfil.agenciaId); }
  catch (e) { console.error('[aprobaciones] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }
  const ahora = new Date();

  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Aprobaciones</h1>
          <p className="suave">{decide ? 'Las piezas listas para tu revisión. Aprueba o pide cambios explicando qué ajustar.' : 'Las piezas enviadas a revisión y cómo respondió el cliente.'}</p>
        </div>
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {!d ? <Aviso tipo="error">No pudimos cargar las aprobaciones. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <>
          <h2 id="h-pendientes">Esperando decisión <span className="etiqueta">{d.pendientes.length}</span></h2>
          {d.pendientes.length === 0 ? <div className="caja"><p className="vacio">No hay piezas esperando una decisión. Cuando el equipo envíe una a revisión, aparecerá aquí.</p></div> : (
            <ul className="apr-lista" aria-labelledby="h-pendientes">
              {d.pendientes.map((p) => {
                const pz = plazo(p.tarea, d.hoy);
                return (
                  <li key={p.tarea.id} className="caja apr-carta">
                    <div className="apr-cab">
                      <div>
                        <span className="etiqueta">{etiquetaFormato(p.tarea.formato)}</span> <span className="suave">{p.marca.nombre}</span>
                        <h3 className="apr-titulo">{p.tarea.titulo}</h3>
                        <p className="suave">
                          {p.version ? `Versión ${p.version.numero}${p.version.nota ? ` · ${p.version.nota}` : ''}` : 'Sin versiones'}
                          {' · publicación '}<span className={pz === 'atrasada' ? 'mala' : undefined}>{fechaCorta(p.tarea.fecha)}{pz === 'atrasada' ? ' (atrasada)' : ''}</span>
                          {p.solicitadaEn ? ` · enviada ${hace(p.solicitadaEn, ahora)}` : ''}
                        </p>
                      </div>
                      {veTablero && <Link className="btn chico" href={`/tablero/${p.tarea.id}`}>Ver pieza</Link>}
                    </div>
                    {decide ? (
                      <form action={decidirDesdeAprobaciones} className="form apr-form">
                        <input type="hidden" name="id" value={p.tarea.id} />
                        <div className="campo"><label htmlFor={`c-${p.tarea.id}`}>Comentario <small>(obligatorio si pides cambios)</small></label><textarea id={`c-${p.tarea.id}`} name="comentario" maxLength={LIMITE.comentario} rows={2} /></div>
                        <div className="acciones-form"><button className="btn primario" type="submit" name="resultado" value="aprobada">Aprobar</button><button className="btn" type="submit" name="resultado" value="cambios">Pedir cambios</button></div>
                      </form>
                    ) : <p className="suave">Esperando la decisión del cliente.</p>}
                  </li>
                );
              })}
            </ul>
          )}

          <h2 id="h-decididas">Decididas recientemente</h2>
          {d.decididas.length === 0 ? <div className="caja"><p className="vacio">Todavía no hay decisiones.</p></div> : (
            <div className="caja">
              <ul className="filas" aria-labelledby="h-decididas">
                {d.decididas.map((x) => (
                  <li key={x.tarea.id} className="fila">
                    <div className="fila-texto">
                      <div className="fila-t">{x.tarea.titulo} <span className="suave">· {x.marca.nombre}</span></div>
                      <div className="fila-m">{x.por ?? 'Cliente'} · {hace(x.decididaEn, ahora)}</div>
                      {x.comentario && <p className="texto-largo apr-cambio">“{x.comentario}”</p>}
                    </div>
                    <span className={`etiqueta ${x.resultado === 'aprobada' ? 'estado-aprobado' : 'etiqueta-aviso'}`}>{ETIQUETA_RESULTADO[x.resultado]}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
