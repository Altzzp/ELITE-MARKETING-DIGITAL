import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { DIAS_SEMANA, cargarCalendario, mesValido, moverMes, tituloMes, type DatosCalendario } from '../../../lib/calendario.ts';
import { ETIQUETA_ESTADO_TAREA, etiquetaFormato } from '../../../lib/panel.ts';
import { esUuid } from '../../../lib/usuarios.ts';
import { Aviso } from '../../../componentes/Avisos';
import { SelectorAuto } from '../../../componentes/EnvioAuto';

export const metadata: Metadata = { title: 'Calendario' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');
const POR_DIA = 4;

export default async function PaginaCalendario({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('calendario');
  const sp = await searchParams;
  const marcaPedida = texto(sp, 'marca').toLowerCase();
  let d: DatosCalendario | null = null;
  try { d = await cargarCalendario(await clienteServidor(), s.perfil.agenciaId, mesValido(texto(sp, 'mes')) ?? '', marcaPedida); }
  catch (e) { console.error('[calendario] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }

  const veTablero = s.modulos.includes('tablero'), veAprobaciones = s.modulos.includes('aprobaciones');
  const filtro = d && esUuid(marcaPedida) && d.marcas.some((m) => m.id === marcaPedida) ? marcaPedida : '';
  const enlace = (mes: string) => `/calendario?mes=${mes}${filtro ? `&marca=${filtro}` : ''}`;

  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Calendario</h1>
          <p className="suave">Las piezas por su fecha de publicación. Es de solo lectura: las fechas se cambian al editar la pieza en el Tablero.</p>
        </div>
      </div>
      {!d ? <Aviso tipo="error">No pudimos cargar el calendario. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <>
          <div className="cal-barra">
            <nav className="cal-nav" aria-label="Cambiar de mes">
              <Link className="btn" href={enlace(moverMes(d.mes, -1))} aria-label="Mes anterior">‹</Link>
              <h2 className="cal-mes" aria-live="polite">{tituloMes(d.mes)}</h2>
              <Link className="btn" href={enlace(moverMes(d.mes, 1))} aria-label="Mes siguiente">›</Link>
              {d.mes !== d.hoy.slice(0, 7) && <Link className="btn" href={enlace(d.hoy.slice(0, 7))}>Hoy</Link>}
            </nav>
            {d.marcas.length > 1 && (
              <form method="get" action="/calendario" className="filtros-tablero">
                <input type="hidden" name="mes" value={d.mes} />
                <div className="campo"><span className="rotulo-campo">Marca</span>
                  <SelectorAuto name="marca" valor={filtro} etiqueta="Filtrar por marca" opciones={[{ valor: '', texto: 'Todas las marcas' }, ...d.marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]} /></div>
                <noscript><div className="acciones-form"><button className="btn" type="submit">Filtrar</button></div></noscript>
              </form>
            )}
          </div>
          {d.marcas.length === 0 && <Aviso tipo="info">Todavía no hay marcas visibles para ti. Cuando un Administrador te asigne marcas, aquí verás sus piezas.</Aviso>}
          <div className="cal" role="group" aria-label={`Piezas de ${tituloMes(d.mes)}`}>
            {DIAS_SEMANA.map((n) => <div key={n} className="cal-sem" aria-hidden="true">{n}</div>)}
            {d.celdas.map((c) => {
              const piezas = d!.tareas.filter((t) => t.fecha === c.dia);
              const vacio = piezas.length === 0;
              return (
                <div key={c.dia} className={`cal-dia${c.delMes ? '' : ' fuera'}${c.dia === d!.hoy ? ' hoy' : ''}${vacio ? ' vacio-dia' : ''}`}>
                  <span className="cal-num">{Number(c.dia.slice(8))}<span className="sr"> de {tituloMes(c.dia.slice(0, 7))}</span></span>
                  {piezas.slice(0, POR_DIA).map((t) => {
                    const marca = d!.marcas.find((m) => m.id === t.marcaId);
                    const contenido = <><span className="cal-pieza-cab">{etiquetaFormato(t.formato)} · {marca?.corto ?? '—'}</span><span className="cal-pieza-titulo">{t.titulo}</span><span className="sr"> ({ETIQUETA_ESTADO_TAREA[t.estado]})</span></>;
                    const href = veTablero ? `/tablero/${t.id}` : veAprobaciones && t.estado === 'en_revision' ? '/aprobaciones' : null;
                    return href ? <Link key={t.id} href={href} className={`cal-pieza cal-e-${t.estado}`}>{contenido}</Link> : <span key={t.id} className={`cal-pieza cal-e-${t.estado}`}>{contenido}</span>;
                  })}
                  {piezas.length > POR_DIA && <span className="suave cal-mas">+{piezas.length - POR_DIA} más</span>}
                </div>
              );
            })}
          </div>
          <ul className="cal-leyenda" aria-label="Colores por estado">
            {(['en_diseno', 'en_revision', 'aprobado', 'publicado'] as const).map((e) => <li key={e}><span className={`cal-muestra cal-e-${e}`} />{ETIQUETA_ESTADO_TAREA[e]}</li>)}
          </ul>
          {d.tareas.length >= 600 && <p className="suave">Se muestran las primeras 600 piezas del mes. Filtra por marca para ver menos.</p>}
          {d.tareas.length === 0 && d.marcas.length > 0 && <p className="suave">No hay piezas programadas en {tituloMes(d.mes)}.</p>}
        </>
      )}
    </section>
  );
}
