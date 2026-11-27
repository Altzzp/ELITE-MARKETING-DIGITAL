import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { cargarTablero, type DatosTablero } from '../../../lib/tablero-datos.ts';
import { ESTADOS_TAREA, ETIQUETA_ESTADO_TAREA, etiquetaFormato, fechaCorta } from '../../../lib/panel.ts';
import { AVISOS_TABLERO, agruparPorEstado, filtrarTareas, plazo, puedeCrearTareas, type Tarea } from '../../../lib/tablero.ts';
import { esUuid } from '../../../lib/usuarios.ts';
import { Aviso } from '../../../componentes/Avisos';
import { SelectorAuto } from '../../../componentes/EnvioAuto';

export const metadata: Metadata = { title: 'Tablero' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

function Tarjeta({ t, d }: { t: Tarea; d: DatosTablero }) {
  const marca = d.marcas.find((m) => m.id === t.marcaId);
  const p = plazo(t, d.hoy);
  const resp = t.responsableId ? d.nombres.get(t.responsableId) ?? 'Sin nombre' : null;
  return (
    <li>
      <Link href={`/tablero/${t.id}`} className="pieza">
        <span className="pieza-cab"><span className="etiqueta">{etiquetaFormato(t.formato)}</span><span className="pieza-marca">{marca?.corto ?? '—'}</span></span>
        <b className="pieza-titulo">{t.titulo}</b>
        <span className="pieza-pie">
          <span className={p === 'atrasada' ? 'pieza-fecha mala' : 'pieza-fecha'}>{p === 'atrasada' ? 'Atrasada · ' : p === 'hoy' ? 'Hoy · ' : ''}{fechaCorta(t.fecha)}</span>
          <span className="pieza-resp">{resp ?? 'Sin responsable'}</span>
        </span>
        {t.aprobacion === 'cambios' && t.estado === 'en_diseno' && <span className="etiqueta etiqueta-aviso">Con cambios pedidos</span>}
        {t.aprobacion === 'pendiente' && <span className="etiqueta etiqueta-info">Esperando al cliente</span>}
      </Link>
    </li>
  );
}

export default async function PaginaTablero({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('tablero');
  const sp = await searchParams;
  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const aviso = Object.hasOwn(AVISOS_TABLERO, codigo) ? AVISOS_TABLERO[codigo]! : undefined;

  let d: DatosTablero | null = null;
  try { d = await cargarTablero(await clienteServidor(), s.perfil.agenciaId); }
  catch (e) { console.error('[tablero] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }

  const marcaPedida = texto(sp, 'marca').toLowerCase(), respPedido = texto(sp, 'responsable').toLowerCase();
  const filtros = {
    q: texto(sp, 'q').slice(0, 80),
    marca: d && esUuid(marcaPedida) && d.marcas.some((m) => m.id === marcaPedida) ? marcaPedida : '',
    responsable: respPedido === 'yo' || respPedido === 'sin' || (d && d.disenadores.some((p) => p.id === respPedido)) ? respPedido : '',
  };
  const columnas = d ? agruparPorEstado(filtrarTareas(d.tareas, filtros, s.usuario.id)) : null;
  const hayFiltros = filtros.q !== '' || filtros.marca !== '' || filtros.responsable !== '';
  const total = columnas ? ESTADOS_TAREA.reduce((n, e) => n + columnas[e].length, 0) : 0;
  const puedeCrear = puedeCrearTareas(s.perfil.rol) && !!d && d.marcas.length > 0;

  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Tablero</h1>
          <p className="suave">Cada pieza avanza de diseño a publicado. Ábrela para subir versiones, comentar, enviarla a revisión o confirmar su publicación.</p>
        </div>
        {puedeCrear && <Link className="btn primario" href="/tablero/nueva">Nueva tarea</Link>}
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {!d || !columnas ? <Aviso tipo="error">No pudimos cargar el tablero. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <>
          <form method="get" action="/tablero" className="filtros-tablero">
            <div className="campo"><label htmlFor="f-q">Buscar</label><input id="f-q" name="q" type="search" defaultValue={filtros.q} placeholder="Título de la pieza" maxLength={80} autoComplete="off" /></div>
            {d.marcas.length > 1 && (
              <div className="campo"><span className="rotulo-campo">Marca</span>
                <SelectorAuto name="marca" valor={filtros.marca} etiqueta="Filtrar por marca" opciones={[{ valor: '', texto: 'Todas las marcas' }, ...d.marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]} /></div>
            )}
            {s.perfil.rol !== 'disenador' && (
              <div className="campo"><span className="rotulo-campo">Responsable</span>
                <SelectorAuto name="responsable" valor={filtros.responsable} etiqueta="Filtrar por responsable" opciones={[{ valor: '', texto: 'Todos' }, ...(s.perfil.rol !== 'cliente' ? [{ valor: 'yo', texto: 'Mis piezas' }] : []), { valor: 'sin', texto: 'Sin responsable' }, ...d.disenadores.map((p) => ({ valor: p.id, texto: p.nombre }))]} /></div>
            )}
            <div className="acciones-form"><button className="btn" type="submit">Buscar</button>{hayFiltros && <Link className="btn" href="/tablero">Quitar filtros</Link>}</div>
          </form>

          {d.marcas.length === 0 ? <Aviso tipo="info">Todavía no hay marcas visibles para ti. Cuando un Administrador te asigne marcas, aquí verás sus piezas.</Aviso>
            : total === 0 ? <Aviso tipo="info">{hayFiltros ? 'Ninguna pieza coincide con los filtros.' : puedeCrear ? 'Aún no hay piezas. Crea la primera con «Nueva tarea».' : 'Aún no hay piezas para mostrar.'}</Aviso> : null}

          <div className="tablero" role="list" aria-label="Piezas por estado">
            {ESTADOS_TAREA.map((e) => (
              <section key={e} className={`columna columna-${e}`} aria-labelledby={`col-${e}`} role="listitem">
                <header className="columna-cab"><h2 id={`col-${e}`}>{ETIQUETA_ESTADO_TAREA[e]}</h2><span className="etiqueta" aria-label={`${columnas[e].length} piezas`}>{columnas[e].length}</span></header>
                {columnas[e].length ? <ul className="piezas">{columnas[e].map((t) => <Tarjeta key={t.id} t={t} d={d} />)}</ul> : <p className="vacio">Sin piezas</p>}
              </section>
            ))}
          </div>
          {d.tareas.filter((t) => t.estado !== 'publicado').length >= 300 && <p className="suave">Se muestran las 300 piezas abiertas más próximas. Usa los filtros para acotar.</p>}
        </>
      )}
    </section>
  );
}
