import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { AVISOS_CHAT, MODOS, PROVEEDORES, cargarChat, esProveedor, etiquetaModo, etiquetaProveedor, puedeUsarChat, type DatosChat, type ProveedorId } from '../../../lib/chat.ts';
import { crearAdaptadores } from '../../../ia/proveedores.ts';
import { etiquetaFormato, hace } from '../../../lib/panel.ts';
import { guardarComoIdea, nuevaConversacion } from '../../../acciones/chat.ts';
import { Aviso } from '../../../componentes/Avisos';
import EnviarMensaje from '../../../componentes/EnviarMensaje';

export const metadata: Metadata = { title: 'Chat de IA' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

export default async function PaginaChat({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('chat');
  const sp = await searchParams;
  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const aviso = Object.hasOwn(AVISOS_CHAT, codigo) ? AVISOS_CHAT[codigo]! : undefined;
  const permitido = puedeUsarChat(s.perfil.rol);
  const adaptadores = crearAdaptadores(process.env);
  const conectados: ProveedorId[] = PROVEEDORES.map((p) => p.id).filter((id) => Boolean(adaptadores[id]));

  let d: DatosChat | null = null;
  try { d = await cargarChat(await clienteServidor(), texto(sp, 'c').toLowerCase()); }
  catch (e) { console.error('[chat] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }
  const ahora = new Date();
  const marcaDe = (id: string) => d?.marcas.find((m) => m.id === id)?.nombre ?? 'Marca archivada';

  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Chat de IA</h1>
          <p className="suave">Pide ideas, copies, guiones o calendarios para una marca. Las propuestas buenas se guardan en el banco de Ideas con un clic.</p>
        </div>
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {!permitido && <Aviso tipo="info">Tu rol no tiene acceso al chat de IA.</Aviso>}
      {permitido && conectados.length === 0 && (
        <Aviso tipo="info">El chat todavía no está conectado a ningún modelo de IA. Para activarlo, quien administra la plataforma debe añadir la clave de un proveedor (Claude, ChatGPT o Gemini) en la configuración del servidor; la guía paso a paso está en <b>GUIA_CUENTAS.md</b>. Mientras tanto puedes abrir conversaciones, pero no recibirán respuesta.</Aviso>
      )}
      {!d ? <Aviso tipo="error">No pudimos cargar el chat. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : permitido && (
        <div className="chat">
          <aside className="chat-lateral" aria-label="Conversaciones">
            <details className="plegable" open={d.conversaciones.length === 0}>
              <summary>Nueva conversación</summary>
              {d.marcas.length === 0 ? <p className="suave">Todavía no hay marcas visibles para ti.</p> : (
                <form action={nuevaConversacion} className="form">
                  <div className="campo"><label htmlFor="n-marca">Marca *</label>
                    <select id="n-marca" name="marca" className="sel" defaultValue={d.marcas.length === 1 ? d.marcas[0]!.id : ''} required>
                      <option value="">Elige una marca…</option>{d.marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select></div>
                  <div className="campo"><label htmlFor="n-modo">Qué necesitas</label>
                    <select id="n-modo" name="modo" className="sel" defaultValue="ideas">{MODOS.map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}</select></div>
                  <div className="campo"><label htmlFor="n-prov">Modelo</label>
                    <select id="n-prov" name="proveedor" className="sel" defaultValue={conectados[0] ?? 'claude'}>
                      {PROVEEDORES.map((p) => <option key={p.id} value={p.id}>{p.texto}{conectados.includes(p.id) ? '' : ' (no conectado)'}</option>)}
                    </select></div>
                  <div className="campo"><label htmlFor="n-titulo">Título (opcional)</label><input id="n-titulo" name="titulo" maxLength={120} autoComplete="off" /></div>
                  <div className="acciones-form"><button className="btn primario" type="submit">Abrir conversación</button></div>
                </form>
              )}
            </details>
            {d.conversaciones.length > 0 && (
              <ul className="chat-lista">
                {d.conversaciones.map((c) => (
                  <li key={c.id}>
                    <Link href={`/chat?c=${c.id}`} className={`chat-item${d!.actual?.id === c.id ? ' activo' : ''}`} aria-current={d!.actual?.id === c.id ? 'page' : undefined}>
                      <b>{c.titulo}</b><span className="suave">{marcaDe(c.marcaId)} · {etiquetaModo(c.modo)} · {hace(c.actualizadaEn, ahora)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <div className="chat-principal">
            {!d.actual ? <div className="caja"><p className="vacio">{d.conversaciones.length ? 'Elige una conversación de la lista o abre una nueva.' : 'Abre tu primera conversación para empezar.'}</p></div> : (
              <>
                <h2 className="chat-titulo">{d.actual.titulo} <span className="etiqueta">{marcaDe(d.actual.marcaId)}</span></h2>
                <ol className="mensajes" aria-label="Mensajes">
                  {d.mensajes.length === 0 && <li className="suave">Todavía no hay mensajes. Escribe qué necesitas abajo.</li>}
                  {d.mensajes.map((m) => (
                    <li key={m.id} className={`mensaje mensaje-${m.rol}`}>
                      <span className="mensaje-quien">{m.rol === 'usuario' ? 'Tú' : `${etiquetaProveedor(m.proveedor)}${m.modelo ? ` · ${m.modelo}` : ''}`}</span>
                      <p className="texto-largo">{m.texto}</p>
                      {m.elementos.length > 0 && (
                        <ul className="propuestas">
                          {m.elementos.map((e, i) => (
                            <li key={i} className="propuesta caja">
                              <div className="idea-cab"><span className="etiqueta">{etiquetaFormato(e.formato)}</span>{e.fecha && <span className="suave">{e.fecha}</span>}</div>
                              <b>{e.titulo}</b>
                              {e.cuerpo && <p className="texto-largo">{e.cuerpo}</p>}
                              {s.modulos.includes('ideas') && (
                                <form action={guardarComoIdea}>
                                  <input type="hidden" name="conversacion" value={d!.actual!.id} /><input type="hidden" name="mensaje" value={m.id} /><input type="hidden" name="indice" value={i} />
                                  <button className="btn" type="submit">Guardar en ideas</button>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
                {conectados.length > 0
                  ? <EnviarMensaje conversacionId={d.actual.id} modoInicial={MODOS.some((m) => m.id === d!.actual!.modo) ? (d.actual.modo as (typeof MODOS)[number]['id']) : 'ideas'} proveedorInicial={esProveedor(d.actual.proveedor) ? d.actual.proveedor : 'claude'} conectados={conectados} />
                  : <p className="suave">No se pueden enviar mensajes hasta conectar un modelo de IA.</p>}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
