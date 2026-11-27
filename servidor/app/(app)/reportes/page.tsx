import type { Metadata } from 'next';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { PERIODOS, cargarReporte, formatoDuracion, periodoValido, sumarFilas, type DatosReporte } from '../../../lib/reportes.ts';
import { diaEnZona, porcentaje } from '../../../lib/panel.ts';
import { esUuid } from '../../../lib/usuarios.ts';
import { Aviso } from '../../../componentes/Avisos';
import { SelectorAuto } from '../../../componentes/EnvioAuto';
import BotonImprimir from '../../../componentes/BotonImprimir';

export const metadata: Metadata = { title: 'Reportes' };

const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

export default async function PaginaReportes({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('reportes');
  const sp = await searchParams;
  const periodo = periodoValido(texto(sp, 'periodo')), marcaPedida = texto(sp, 'marca').toLowerCase();
  let d: DatosReporte | null = null;
  try { d = await cargarReporte(await clienteServidor(), s.perfil.agenciaId, periodo, marcaPedida); }
  catch (e) { console.error('[reportes] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }

  const filtro = d && esUuid(marcaPedida) && d.marcas.some((m) => m.id === marcaPedida) ? marcaPedida : '';
  const nombreMarca = (id: string) => d?.marcas.find((m) => m.id === id);
  const t = d ? sumarFilas(d.filas) : null;
  const textoPeriodo = PERIODOS.find((p) => p.id === periodo)?.texto ?? '';

  return (
    <section className="pagina ancha reporte">
      <div className="cabecera-panel">
        <div>
          <h1>Reportes</h1>
          <p className="suave">Cumplimiento de fechas, tiempos de aprobación y publicaciones por marca. «A tiempo» cuenta las piezas publicadas el día programado o antes.</p>
        </div>
        <BotonImprimir />
      </div>
      {!d || !t ? <Aviso tipo="error">No pudimos cargar los reportes. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <>
          <form method="get" action="/reportes" className="filtros-tablero no-imprimir">
            <div className="campo"><span className="rotulo-campo">Periodo</span>
              <SelectorAuto name="periodo" valor={periodo} etiqueta="Periodo del reporte" opciones={PERIODOS.map((p) => ({ valor: p.id, texto: p.texto }))} /></div>
            {d.marcas.length > 1 && (
              <div className="campo"><span className="rotulo-campo">Marca</span>
                <SelectorAuto name="marca" valor={filtro} etiqueta="Filtrar por marca" opciones={[{ valor: '', texto: 'Todas las marcas' }, ...d.marcas.map((m) => ({ valor: m.id, texto: m.activa ? m.nombre : `${m.nombre} (archivada)` }))]} /></div>
            )}
            <noscript><div className="acciones-form"><button className="btn" type="submit">Ver</button></div></noscript>
          </form>
          <p className="suave solo-imprimir">{textoPeriodo} · {filtro ? nombreMarca(filtro)?.nombre : 'Todas las marcas'} · generado el {diaEnZona(new Date(d.generado), d.zona)}</p>

          <div className="kpis">
            <div className="kpi"><span className="kpi-et">Piezas</span><b className="kpi-valor">{t.total}</b></div>
            <div className="kpi"><span className="kpi-et">Publicadas</span><b className="kpi-valor">{t.publicadas}</b><span className="kpi-nota">{porcentaje(t.publicadas, t.total)} del total</span></div>
            <div className="kpi"><span className="kpi-et">Pendientes</span><b className="kpi-valor">{t.pendientes}</b></div>
            <div className={`kpi${t.atrasadas > 0 ? ' kpi-malo' : ''}`}><span className="kpi-et">Atrasadas</span><b className="kpi-valor">{t.atrasadas}</b></div>
          </div>

          <h2>Por marca</h2>
          {d.filas.length === 0 ? <div className="caja"><p className="vacio">No hay piezas en este periodo{filtro ? ' para esta marca' : ''}.</p></div> : (
            <div className="tablewrap">
              <table className="tabla">
                <thead><tr><th scope="col">Marca</th><th scope="col">Piezas</th><th scope="col">Publicadas</th><th scope="col">Pendientes</th><th scope="col">Atrasadas</th><th scope="col">A tiempo</th><th scope="col">Espera de aprobación</th><th scope="col">Versiones por pieza</th></tr></thead>
                <tbody>
                  {d.filas.map((f) => {
                    const m = nombreMarca(f.marcaId);
                    return (
                      <tr key={f.marcaId}>
                        <th scope="row">{m?.nombre ?? '—'}{m && !m.activa && <> <span className="etiqueta">Archivada</span></>}</th>
                        <td>{f.total}</td><td>{f.publicadas}</td><td>{f.pendientes}</td>
                        <td className={f.atrasadas > 0 ? 'mala' : undefined}>{f.atrasadas}</td>
                        <td>{f.cumplimiento === null ? '—' : `${Math.round(f.cumplimiento)} %`}</td>
                        <td>{f.rondas > 0 ? `${formatoDuracion(f.espera)} (${f.rondas} ${f.rondas === 1 ? 'ronda' : 'rondas'})` : '—'}</td>
                        <td>{f.versiones === null ? '—' : f.versiones}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <h2>Publicaciones por canal</h2>
          {d.canales.length === 0 ? <div className="caja"><p className="vacio">Aún no hay publicaciones confirmadas en este periodo.</p></div> : (
            <div className="tablewrap">
              <table className="tabla">
                <thead><tr><th scope="col">Canal</th><th scope="col">Publicaciones</th></tr></thead>
                <tbody>{d.canales.map((c) => <tr key={c.canal}><th scope="row">{c.canal}</th><td>{c.total}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          {d.publicaciones >= 5000 && <p className="suave">Se cuentan las 5000 publicaciones más recientes del periodo.</p>}
        </>
      )}
    </section>
  );
}
