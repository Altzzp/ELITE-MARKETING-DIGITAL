// Piezas visuales del Panel (componentes de servidor, sin JavaScript en el navegador). Los gráficos son SVG con atributos: la CSP no admite estilos en línea.
import Link from 'next/link';
import {
  ESTADOS_TAREA, ETIQUETA_ESTADO_TAREA, anchoBarra, etiquetaFormato, fechaCorta, hace, segmentosDona,
  type EstadoTarea,
} from '../lib/panel.ts';
import type { DatosPanel, Marca } from '../lib/panel-datos.ts';

const nombreDe = (marcas: readonly Marca[], id: string, largo = true) => { const m = marcas.find((x) => x.id === id); return m ? (largo ? m.nombre : m.corto) : '—'; };

export function Indicador({ etiqueta, valor, nota, malo }: { etiqueta: string; valor: number; nota: string; malo?: boolean }) {
  return (
    <div className={`kpi${malo ? ' kpi-malo' : ''}`}>
      <div className="kpi-et">{etiqueta}</div>
      <div className="kpi-valor">{valor}</div>
      <div className="kpi-nota">{nota}</div>
    </div>
  );
}

function Barra({ ancho, clase }: { ancho: number; clase: string }) {
  return (
    <svg className="gbarra" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect className="gbarra-fondo" x="0" y="0" width="100" height="8" />
      {ancho > 0 && <rect className={clase} x="0" y="0" width={`${ancho}`} height="8" />}
    </svg>
  );
}

export function RendimientoPorMarca({ d }: { d: DatosPanel }) {
  const visibles = d.marcas.filter((m) => !d.marcaElegida || m.id === d.marcaElegida);
  if (visibles.length === 0) return <p className="vacio">Cuando tengas marcas asignadas verás su rendimiento aquí.</p>;
  const porMarca = new Map(d.metricas.map((m) => [m.marcaId, m]));
  const maximo = Math.max(0, ...visibles.map((m) => { const x = porMarca.get(m.id); return x ? Math.max(x.publicadas, x.pendientes) : 0; }));
  return (
    <>
    <ul className="leyenda-h" aria-label="Qué significa cada barra">
      <li><i className="punto punto-real" aria-hidden="true" />Realizadas</li>
      <li><i className="punto punto-pend" aria-hidden="true" />Pendientes</li>
    </ul>
    <ul className="gbarras">
      {visibles.map((m) => {
        const x = porMarca.get(m.id), pub = x?.publicadas ?? 0, pen = x?.pendientes ?? 0;
        return (
          <li key={m.id} className="gbarras-fila">
            <span className="gbarras-marca">{m.corto}</span>
            <span className="gbarras-pistas">
              <Barra ancho={anchoBarra(pub, maximo)} clase="gbarra-real" />
              <Barra ancho={anchoBarra(pen, maximo)} clase="gbarra-pend" />
            </span>
            <span className="gbarras-cifras">{pub} realizadas · {pen} pendientes</span>
          </li>
        );
      })}
    </ul>
    </>
  );
}

export function DonaPorEstado({ conteo }: { conteo: Record<EstadoTarea, number> }) {
  const segmentos = segmentosDona(conteo), total = ESTADOS_TAREA.reduce((a, e) => a + conteo[e], 0);
  return (
    <div className="dona-caja">
      <div className="dona-grafico">
        <svg className="dona" viewBox="0 0 42 42" aria-hidden="true" focusable="false">
          <circle className="dona-fondo" cx="21" cy="21" r="16" fill="none" strokeWidth="6" />
          {segmentos.map((s) => (
            <circle key={s.estado} className={`seg seg-${s.estado}`} cx="21" cy="21" r="16" fill="none" strokeWidth="6" pathLength="100"
              strokeDasharray={`${s.largo} ${100 - s.largo}`} strokeDashoffset={-s.desde} transform="rotate(-90 21 21)" />
          ))}
        </svg>
        <div className="dona-centro"><b>{total}</b><span>actividades</span></div>
      </div>
      <ul className="leyenda">
        {ESTADOS_TAREA.map((e) => <li key={e}><i className={`punto punto-${e}`} aria-hidden="true" />{ETIQUETA_ESTADO_TAREA[e]}<b>{conteo[e]}</b></li>)}
      </ul>
    </div>
  );
}

export function Tarjeta({ titulo, enlace, children }: { titulo: string; enlace?: { href: string; texto: string } | undefined; children: React.ReactNode }) {
  return (
    <section className="caja">
      <header className="caja-cab"><h2>{titulo}</h2>{enlace && <Link className="btn chico" href={enlace.href}>{enlace.texto}</Link>}</header>
      {children}
    </section>
  );
}

export function ListaPendientes({ d }: { d: DatosPanel }) {
  if (d.pendientes.length === 0) return <p className="vacio">Nada pendiente. Todas las actividades están publicadas.</p>;
  return (
    <ul className="filas">
      {d.pendientes.map((p) => (
        <li key={p.id} className="fila">
          <div className="fila-texto">
            <div className="fila-t">{p.titulo}</div>
            <div className="fila-m">{nombreDe(d.marcas, p.marcaId)} · {etiquetaFormato(p.formato)} · {ETIQUETA_ESTADO_TAREA[p.estado]} · {p.responsable ?? 'Sin responsable'}</div>
          </div>
          <span className={`fila-fecha${p.atrasada ? ' atrasada' : ''}`}>{fechaCorta(p.fecha)}{p.atrasada ? ' · atrasada' : ''}</span>
        </li>
      ))}
    </ul>
  );
}

export function ListaRealizadas({ d, ahora }: { d: DatosPanel; ahora: Date }) {
  if (d.realizadas.length === 0) return <p className="vacio">Aún no hay publicaciones. Aparecerán cuando se confirme una publicación.</p>;
  return (
    <ul className="filas">
      {d.realizadas.map((p) => (
        <li key={p.id} className="fila">
          <div className="fila-texto">
            <div className="fila-t">{p.titulo}</div>
            <div className="fila-m">{nombreDe(d.marcas, p.marcaId)} · {etiquetaFormato(p.formato)} · {hace(p.publicadaEn, ahora)}</div>
          </div>
          <span className={`etiqueta ${p.aTiempo ? 'etiqueta-ok' : 'etiqueta-aviso'}`}>{p.aTiempo ? 'A tiempo' : 'Con retraso'}</span>
        </li>
      ))}
    </ul>
  );
}

export function ListaSubidas({ d, ahora }: { d: DatosPanel; ahora: Date }) {
  if (d.subidas.length === 0) return <p className="vacio">Sin contenido subido. Aparecerá cuando se suba una versión de una pieza.</p>;
  return (
    <ul className="filas">
      {d.subidas.map((s) => (
        <li key={`${s.tareaId}-${s.numero}`} className="fila">
          <div className="fila-texto">
            <div className="fila-t">{s.titulo}</div>
            <div className="fila-m">{nombreDe(d.marcas, s.marcaId)} · Versión {s.numero} · {s.autor ?? '—'} · {hace(s.creadoEn, ahora)}</div>
          </div>
          <span className="suave">{etiquetaFormato(s.formato)}</span>
        </li>
      ))}
    </ul>
  );
}
