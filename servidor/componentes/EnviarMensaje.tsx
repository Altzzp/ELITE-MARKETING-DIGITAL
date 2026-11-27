'use client';
// Caja de escritura del chat. Envía a /api/ia (la ruta guarda la pregunta y la respuesta) y recarga la conversación al terminar.
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LIMITE_TEXTO, MODOS, PROVEEDORES, type ModoId, type ProveedorId } from '../lib/chat.ts';

type Props = { conversacionId: string; modoInicial: ModoId; proveedorInicial: ProveedorId; conectados: readonly ProveedorId[] };

export default function EnviarMensaje({ conversacionId, modoInicial, proveedorInicial, conectados }: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const caja = useRef<HTMLTextAreaElement>(null);
  const proveedores = PROVEEDORES.filter((p) => conectados.includes(p.id));

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (enviando) return;
    const datos = new FormData(e.currentTarget);
    const texto = String(datos.get('texto') ?? '').trim();
    if (!texto) { setError('Escribe qué necesitas.'); caja.current?.focus(); return; }
    setError(''); setEnviando(true);
    const corte = new AbortController();
    const reloj = setTimeout(() => corte.abort(), 60_000);
    try {
      const r = await fetch('/api/ia', {
        method: 'POST', headers: { 'content-type': 'application/json' }, signal: corte.signal,
        body: JSON.stringify({ conversacion_id: conversacionId, texto, modo: String(datos.get('modo')), proveedor: String(datos.get('proveedor')) }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; mensaje?: string } | null;
      if (!r.ok || !j?.ok) { setError(typeof j?.mensaje === 'string' && j.mensaje ? j.mensaje : 'No se pudo obtener la respuesta. Inténtalo de nuevo.'); return; }
      if (caja.current) caja.current.value = '';
      router.refresh();
    } catch (x) {
      setError(x instanceof DOMException && x.name === 'AbortError' ? 'La respuesta tardó demasiado. Inténtalo de nuevo.' : 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.');
    } finally { clearTimeout(reloj); setEnviando(false); }
  }

  return (
    <form onSubmit={enviar} className="chat-caja" aria-busy={enviando}>
      <div className="campo">
        <label htmlFor="chat-texto">Tu mensaje</label>
        <textarea id="chat-texto" name="texto" ref={caja} maxLength={LIMITE_TEXTO} placeholder="Ej. Dame 5 ideas de reels para la campaña de verano" disabled={enviando} />
      </div>
      <div className="fila-form">
        <div className="campo"><label htmlFor="chat-modo">Qué necesitas</label>
          <select id="chat-modo" name="modo" className="sel" defaultValue={modoInicial} disabled={enviando}>{MODOS.map((m) => <option key={m.id} value={m.id}>{m.texto}</option>)}</select></div>
        <div className="campo"><label htmlFor="chat-prov">Modelo</label>
          <select id="chat-prov" name="proveedor" className="sel" defaultValue={conectados.includes(proveedorInicial) ? proveedorInicial : proveedores[0]?.id} disabled={enviando}>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.texto}</option>)}</select></div>
      </div>
      {error && <p role="alert" className="aviso aviso-error">{error}</p>}
      <div className="acciones-form"><button className="btn primario" type="submit" disabled={enviando}>{enviando ? 'Pensando…' : 'Enviar'}</button></div>
    </form>
  );
}
