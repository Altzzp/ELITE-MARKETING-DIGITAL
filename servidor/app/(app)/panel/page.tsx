import type { Metadata } from 'next';
import { exigirSesion } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { AVISOS_PANEL } from '../../../lib/seguridad.ts';
import { ETIQUETA_ROL } from '../../../lib/modulos.ts';
import { cargarPanel, type DatosPanel } from '../../../lib/panel-datos.ts';
import { fechaLarga, porcentaje } from '../../../lib/panel.ts';
import { Aviso } from '../../../componentes/Avisos';
import { SelectorAuto } from '../../../componentes/EnvioAuto';
import { DonaPorEstado, Indicador, ListaPendientes, ListaRealizadas, ListaSubidas, RendimientoPorMarca, Tarjeta } from '../../../componentes/PanelPartes';

export const metadata: Metadata = { title: 'Panel' };

export default async function PaginaPanel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirSesion();   // cada página verifica por su cuenta: el layout no se vuelve a ejecutar al navegar
  const sp = await searchParams;
  const codigo = typeof sp['e'] === 'string' ? sp['e'] : '';
  const aviso = Object.hasOwn(AVISOS_PANEL, codigo) ? AVISOS_PANEL[codigo] : undefined;
  const ahora = new Date();

  let d: DatosPanel | null = null;
  try { d = await cargarPanel(await clienteServidor(), s.perfil.agenciaId, typeof sp['marca'] === 'string' ? sp['marca'] : '', ahora); }
  catch (e) { console.error('[panel] no se pudieron cargar los datos:', e instanceof Error ? e.message : 'error'); }   // el mensaje lleva solo el código de la base

  const t = d?.totales;
  return (
    <section className="pagina ancha">
      <div className="cabecera-panel">
        <div>
          <h1>Hola, {s.perfil.nombre.split(' ')[0]}</h1>
          <p className="suave">{fechaLarga(ahora, d?.zona ?? 'UTC')} · {ETIQUETA_ROL[s.perfil.rol]} en {s.agencia}</p>
        </div>
        {d && d.marcas.length > 1 && (
          <form method="get" action="/panel" className="en-linea">
            <SelectorAuto name="marca" valor={d.marcaElegida ?? ''} etiqueta="Filtrar por marca" opciones={[{ valor: '', texto: 'Todas las marcas' }, ...d.marcas.map((m) => ({ valor: m.id, texto: m.nombre }))]} />
            <noscript><button className="btn chico" type="submit">Ver</button></noscript>
          </form>
        )}
      </div>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {!d || !t ? <Aviso tipo="error">No pudimos cargar tus indicadores. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <>
          {d.marcas.length === 0 && <Aviso tipo="info">Todavía no hay marcas visibles para ti. Cuando un Administrador te asigne marcas, aquí verás su avance.</Aviso>}
          <div className="kpis">
            <Indicador etiqueta="Actividades totales" valor={t.total} nota={`${t.pendientes} por completar`} />
            <Indicador etiqueta="Actividades realizadas" valor={t.publicadas} nota={t.total ? `${porcentaje(t.publicadas, t.total)} del total` : 'Sin actividades'} />
            <Indicador etiqueta="Contenido subido" valor={t.conArchivo} nota="piezas con al menos una versión" />
            <Indicador etiqueta="Vencidas" valor={t.atrasadas} nota={t.atrasadas ? 'Requieren atención hoy' : 'Todo al día'} malo={t.atrasadas > 0} />
          </div>
          <div className="rejilla rejilla-21">
            <Tarjeta titulo="Rendimiento por marca"><RendimientoPorMarca d={d} /></Tarjeta>
            <Tarjeta titulo="Actividades por estado"><DonaPorEstado conteo={d.porEstado} /></Tarjeta>
          </div>
          <div className="rejilla rejilla-3">
            <Tarjeta titulo="Pendientes" enlace={s.modulos.includes('tablero') ? { href: '/tablero', texto: 'Ver tablero' } : undefined}><ListaPendientes d={d} /></Tarjeta>
            <Tarjeta titulo="Realizadas"><ListaRealizadas d={d} ahora={ahora} /></Tarjeta>
            <Tarjeta titulo="Contenido subido"><ListaSubidas d={d} ahora={ahora} /></Tarjeta>
          </div>
        </>
      )}
    </section>
  );
}
