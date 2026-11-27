import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { cargarIdeas, type DatosIdeas } from '../../../lib/ideas-datos.ts';
import { AVISOS_IDEAS, ETIQUETA_ESTADO_IDEA, LIMITE_IDEA, puedeCrearIdeas, puedeDescartar, puedeGestionarIdeas } from '../../../lib/ideas.ts';
import { FORMATOS, etiquetaFormato, fechaCorta } from '../../../lib/panel.ts';
import { esUuid } from '../../../lib/usuarios.ts';
import { cambiarEstadoIdea, crearIdea, descartarIdea, pasarAlTablero } from '../../../acciones/ideas.ts';
import { Aviso } from '../../../componentes/Avisos';
import { SelectorAuto } from '../../../componentes/EnvioAuto';

export const metadata: Metadata = { title: 'Ideas' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

export default async function PaginaIdeas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('ideas');
  const sp = await searchParams;
  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const aviso = Object.hasOwn(AVISOS_IDEAS, codigo) ? AVISOS_IDEAS[codigo]! : undefined;
  const pedida = texto(sp, 'marca').toLowerCase();

  let d: DatosIdeas | null = null;
  try { d = await cargarIdeas(await clienteServidor(), pedida); }
  catch (e) { console.error('[ideas] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }

  const filtro = d && esUuid(pedida) && d.marcas.some((m) => m.id === pedida) ? pedida : '';
  const puedeCrear = puedeCrearIdeas(s.perfil.rol), gestiona = puedeGestionarIdeas(s.perfil.rol);
  const sugerida = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Ideas</h1>
          <p className="suave">El banco de ideas de cada marca. Aprueba las buenas y pásalas al Tablero cuando tengan fecha.</p>
        </div>
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {!d ? <Aviso tipo="error">No pudimos cargar las ideas. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <>
          {puedeCrear && d.marcas.length > 0 && (
            <details className="plegable" open={d.ideas.length === 0}>
              <summary>Nueva idea</summary>
              <form action={crearIdea} className="form ficha-form">
                <input type="hidden" name="filtro" value={filtro} />
                <div className="fila-form">
                  <div className="campo"><label htmlFor="i-marca">Marca *</label>
                    <select id="i-marca" name="marca" className="sel" defaultValue={filtro || (d.marcas.length === 1 ? d.marcas[0]!.id : '')} required>
                      <option value="">Elige una marca…</option>
                      {d.marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select></div>
                  <div className="campo"><label htmlFor="i-formato">Formato *</label>
                    <select id="i-formato" name="formato" className="sel" defaultValue="post" required>
                      {FORMATOS.map((f) => <option key={f} value={f}>{etiquetaFormato(f)}</option>)}
                    </select></div>
                </div>
                <div className="campo"><label htmlFor="i-titulo">Título *</label>
                  <input id="i-titulo" name="titulo" maxLength={LIMITE_IDEA.titulo} required autoComplete="off" placeholder="Ej. Detrás de cámaras del taller" /></div>
                <div className="campo"><label htmlFor="i-desc">Descripción</label>
                  <textarea id="i-desc" name="descripcion" maxLength={LIMITE_IDEA.descripcion} placeholder="De qué trata, tono, referencias…" /></div>
                <div className="acciones-form"><button className="btn primario" type="submit">Guardar idea</button></div>
              </form>
            </details>
          )}

          {d.marcas.length > 1 && (
            <form method="get" action="/ideas" className="filtros-tablero">
              <div className="campo"><span className="rotulo-campo">Marca</span>
                <SelectorAuto name="marca" valor={filtro} etiqueta="Filtrar por marca" opciones={[{ valor: '', texto: 'Todas las marcas' }, ...d.marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]} /></div>
              <noscript><div className="acciones-form"><button className="btn" type="submit">Filtrar</button></div></noscript>
            </form>
          )}

          {d.marcas.length === 0 ? <Aviso tipo="info">Todavía no hay marcas visibles para ti. Cuando un Administrador te asigne marcas, aquí verás sus ideas.</Aviso>
            : d.ideas.length === 0 ? <Aviso tipo="info">Aún no hay ideas{filtro ? ' para esta marca' : ''}. {puedeCrear ? 'Guarda la primera con «Nueva idea».' : ''}</Aviso> : (
              <ul className="ideas" aria-label="Banco de ideas">
                {d.ideas.map((i) => {
                  const marca = d.marcas.find((m) => m.id === i.marcaId);
                  return (
                    <li key={i.id} className="idea caja">
                      <div className="idea-cab">
                        <span className="etiqueta">{etiquetaFormato(i.formato)}</span>
                        <span className={`etiqueta ${i.estado === 'aprobada' ? 'etiqueta-ok' : i.estado === 'en_produccion' ? 'etiqueta-info' : ''}`}>{ETIQUETA_ESTADO_IDEA[i.estado]}</span>
                        {i.origen === 'ia' && <span className="etiqueta etiqueta-aviso">Propuesta de IA</span>}
                        <span className="suave idea-meta">{marca?.nombre ?? '—'} · {i.creadaPor ? d!.nombres.get(i.creadaPor) ?? 'Alguien del equipo' : 'Sin autor'} · {fechaCorta(i.creadaEn.slice(0, 10))}</span>
                      </div>
                      <b className="idea-titulo">{i.titulo}</b>
                      {i.descripcion && <p className="texto-largo">{i.descripcion}</p>}
                      {i.estado === 'en_produccion' ? <p className="suave">Ya es una pieza del {s.modulos.includes('tablero') ? <Link href="/tablero">Tablero</Link> : 'Tablero'}.</p> : (
                        <div className="idea-acciones">
                          {gestiona && (
                            <form action={cambiarEstadoIdea}>
                              <input type="hidden" name="id" value={i.id} /><input type="hidden" name="filtro" value={filtro} />
                              <input type="hidden" name="estado" value={i.estado === 'aprobada' ? 'borrador' : 'aprobada'} />
                              <button className="btn" type="submit">{i.estado === 'aprobada' ? 'Volver a borrador' : 'Aprobar idea'}</button>
                            </form>
                          )}
                          {puedeCrear && (
                            <form action={pasarAlTablero} className="en-linea">
                              <input type="hidden" name="id" value={i.id} /><input type="hidden" name="filtro" value={filtro} />
                              <label className="sr" htmlFor={`f-${i.id}`}>Fecha de publicación</label>
                              <input id={`f-${i.id}`} className="sel" type="date" name="fecha" defaultValue={sugerida} required />
                              <button className="btn primario" type="submit">Pasar al Tablero</button>
                            </form>
                          )}
                          {puedeDescartar(s.perfil.rol, i, s.usuario.id) && (
                            <form action={descartarIdea}>
                              <input type="hidden" name="id" value={i.id} /><input type="hidden" name="filtro" value={filtro} />
                              <button className="btn peligro-btn" type="submit">Descartar</button>
                            </form>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          {d.ideas.length >= 200 && <p className="suave">Se muestran las 200 ideas más recientes. Filtra por marca para ver menos.</p>}
        </>
      )}
    </section>
  );
}
