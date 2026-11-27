import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { MODULOS, ROLES, ETIQUETA_ROL, esRol, type Rol } from '../../../lib/modulos.ts';
import { urlApp } from '../../../lib/web.ts';
import {
  AVISOS_USUARIOS, ETIQUETA_ESTADO, esEstado, esPestana, iniciales, permisoFijo, puedeAdministrar, veTodasLasMarcas, type Estado,
} from '../../../lib/usuarios.ts';
import { cambiarEstado, cambiarPermiso, cambiarRol, guardarMarcas, invitarPersona, revocarInvitacion } from '../../../acciones/usuarios.ts';
import { Aviso } from '../../../componentes/Avisos';
import { CasillaAuto, SelectorAuto } from '../../../componentes/EnvioAuto';

export const metadata: Metadata = { title: 'Usuarios y roles' };

type Persona = { id: string; nombre: string; email: string; rol: Rol; estado: Estado; creado_en: string };
type Invitacion = { id: string; email: string; rol: Rol; marca_ids: string[]; creada_en: string };
type Marca = { id: string; nombre: string };

const OPCIONES_ROL = ROLES.map((r) => ({ valor: r, texto: ETIQUETA_ROL[r] }));
const texto = (sp: Record<string, string | string[] | undefined>, k: string) => (typeof sp[k] === 'string' ? sp[k] : '');

function formatoFecha(iso: string, zona: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const f = (timeZone: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(d);
  try { return f(zona); } catch { return f('UTC'); }
}

function unir<T>(r: { data: T[] | null; error: unknown }, que: string): T[] {
  if (r.error) throw new Error(`No se pudo cargar ${que}`);
  return r.data ?? [];
}

function CasillasDeMarcas({ marcas, elegidas }: { marcas: Marca[]; elegidas: ReadonlySet<string> }) {
  if (marcas.length === 0) return <small className="suave">Todavía no hay marcas creadas. Podrás asignarlas después.</small>;
  return (
    <div className="chips">
      {marcas.map((m) => (
        <label key={m.id} className="chip"><input type="checkbox" className="cb" name="marca" value={m.id} defaultChecked={elegidas.has(m.id)} /> {m.nombre}</label>
      ))}
    </div>
  );
}

export default async function PaginaUsuarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('usuarios');   // sesión verificada y el rol tiene este módulo
  const sp = await searchParams;
  const pestana = esPestana(texto(sp, 'pestana')) ? texto(sp, 'pestana') as 'usuarios' | 'permisos' : 'usuarios';
  const admin = puedeAdministrar(s.perfil.rol);
  const codigo = texto(sp, 'a') || texto(sp, 'e');
  const base = Object.hasOwn(AVISOS_USUARIOS, codigo) ? AVISOS_USUARIOS[codigo]! : undefined;
  const aviso = base && codigo === 'invitada'
    ? { ...base, texto: `Invitación registrada. Pide a la persona que cree su cuenta en ${urlApp()}/registro con ese mismo correo; todavía no se envía ningún correo automático.` }
    : base;

  const sb = await clienteServidor();
  const [perfiles, vinculos, marcas, invitaciones, permisos, agencia] = await Promise.all([
    pestana === 'usuarios' ? sb.from('perfiles').select('id,nombre,email,rol,estado,creado_en').order('nombre', { ascending: true }).limit(500) : null,
    pestana === 'usuarios' ? sb.from('usuario_marcas').select('usuario_id,marca_id').limit(5000) : null,
    pestana === 'usuarios' ? sb.from('marcas').select('id,nombre').order('nombre', { ascending: true }).limit(500) : null,
    pestana === 'usuarios' && admin ? sb.from('invitaciones').select('id,email,rol,marca_ids,creada_en').is('aceptada_en', null).order('creada_en', { ascending: false }).limit(200) : null,
    pestana === 'permisos' ? sb.from('permisos_rol').select('rol,modulo').limit(500) : null,
    sb.from('agencias').select('zona_horaria').eq('id', s.perfil.agenciaId).maybeSingle(),
  ]);
  const zona = typeof agencia.data?.zona_horaria === 'string' ? agencia.data.zona_horaria : 'UTC';

  return (
    <section className="pagina ancha">
      <h1>Usuarios y roles</h1>
      <p className="suave">Quién entra a la plataforma, qué marcas ve y qué secciones usa.</p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <nav className="pestanas" aria-label="Pestañas de usuarios">
        <Link href="/usuarios" aria-current={pestana === 'usuarios' ? 'page' : undefined}>Usuarios</Link>
        <Link href="/usuarios?pestana=permisos" aria-current={pestana === 'permisos' ? 'page' : undefined}>Permisos por rol</Link>
      </nav>

      {pestana === 'usuarios' && perfiles && vinculos && marcas && (() => {
        const personas = unir<Persona>(perfiles as never, 'las personas');
        const listaMarcas = unir<Marca>(marcas as never, 'las marcas');
        const porId = new Map(listaMarcas.map((m) => [m.id, m.nombre]));
        const marcasDe = new Map<string, Set<string>>();
        for (const v of unir<{ usuario_id: string; marca_id: string }>(vinculos as never, 'las marcas de cada persona')) {
          (marcasDe.get(v.usuario_id) ?? marcasDe.set(v.usuario_id, new Set()).get(v.usuario_id)!).add(v.marca_id);
        }
        const pendientes = invitaciones ? unir<Invitacion>(invitaciones as never, 'las invitaciones') : [];
        const chips = (ids: Iterable<string>) => [...ids].filter((id) => porId.has(id)).map((id) => <span key={id} className="chip">{porId.get(id)}</span>);
        return (
          <>
            {admin && (
              <details className="plegable">
                <summary className="btn primario">Invitar persona</summary>
                <form action={invitarPersona} className="form invitar">
                  <div className="campo">
                    <label htmlFor="inv-correo">Correo</label>
                    <input id="inv-correo" name="correo" type="email" required maxLength={254} autoComplete="off" />
                    <small>La persona crea su cuenta con este mismo correo.</small>
                  </div>
                  <div className="campo">
                    <label htmlFor="inv-rol">Rol</label>
                    <select id="inv-rol" name="rol" className="sel" defaultValue="community_manager">{OPCIONES_ROL.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}</select>
                  </div>
                  <fieldset className="campo">
                    <legend>Marcas</legend>
                    <CasillasDeMarcas marcas={listaMarcas} elegidas={new Set()} />
                    <small>Administrador y Dirección ven todas las marcas; para ellos esta lista no se usa.</small>
                  </fieldset>
                  <button className="btn primario" type="submit">Registrar invitación</button>
                </form>
              </details>
            )}

            <div className="tablewrap">
              <table className="tabla">
                <caption className="sr">Personas con acceso</caption>
                <thead><tr><th>Persona</th><th>Rol</th><th>Marcas</th><th>Estado</th><th>Alta</th></tr></thead>
                <tbody>
                  {personas.map((p) => {
                    const yo = p.id === s.usuario.id, rol = esRol(p.rol) ? p.rol : 'cliente', estado: Estado = esEstado(p.estado) ? p.estado : 'suspendido';
                    const mias = marcasDe.get(p.id) ?? new Set<string>();
                    return (
                      <tr key={p.id}>
                        <td>
                          <span className="persona-celda">
                            <span className="avatar" aria-hidden="true">{iniciales(p.nombre)}</span>
                            <span><b>{p.nombre}</b>{yo && <span className="etiqueta"> Tú</span>}<small className="bloque suave">{p.email}</small></span>
                          </span>
                        </td>
                        <td>
                          {admin && !yo ? (
                            <form action={cambiarRol} className="en-linea">
                              <input type="hidden" name="id" value={p.id} />
                              <SelectorAuto name="rol" valor={rol} etiqueta={`Rol de ${p.nombre}`} opciones={OPCIONES_ROL} />
                              <noscript><button className="btn chico" type="submit">Guardar</button></noscript>
                            </form>
                          ) : ETIQUETA_ROL[rol]}
                        </td>
                        <td>
                          {veTodasLasMarcas(rol) ? <span className="suave">Todas</span> : (
                            <>
                              <span className="chips">{mias.size ? chips(mias) : <span className="suave">Ninguna</span>}</span>
                              {admin && (
                                <details className="plegable chico">
                                  <summary>Editar marcas</summary>
                                  <form action={guardarMarcas} className="form">
                                    <input type="hidden" name="id" value={p.id} />
                                    <CasillasDeMarcas marcas={listaMarcas} elegidas={mias} />
                                    <button className="btn chico" type="submit">Guardar marcas</button>
                                  </form>
                                </details>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`etiqueta ${estado === 'activo' ? 'etiqueta-ok' : 'etiqueta-aviso'}`}>{ETIQUETA_ESTADO[estado]}</span>
                          {admin && !yo && (
                            <form action={cambiarEstado} className="en-linea">
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="estado" value={estado === 'activo' ? 'suspendido' : 'activo'} />
                              <button className="btn chico" type="submit">{estado === 'activo' ? 'Suspender' : 'Reactivar'}</button>
                            </form>
                          )}
                        </td>
                        <td className="suave">{formatoFecha(p.creado_en, zona)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {admin && (
              <>
                <h2>Invitaciones pendientes</h2>
                {pendientes.length === 0 ? <p className="suave">No hay invitaciones pendientes.</p> : (
                  <div className="tablewrap">
                    <table className="tabla">
                      <caption className="sr">Invitaciones pendientes</caption>
                      <thead><tr><th>Correo</th><th>Rol</th><th>Marcas</th><th>Invitada</th><th><span className="sr">Acciones</span></th></tr></thead>
                      <tbody>
                        {pendientes.map((i) => (
                          <tr key={i.id}>
                            <td>{i.email}</td>
                            <td>{esRol(i.rol) ? ETIQUETA_ROL[i.rol] : i.rol}</td>
                            <td>{esRol(i.rol) && veTodasLasMarcas(i.rol) ? <span className="suave">Todas</span> : <span className="chips">{i.marca_ids.length ? chips(i.marca_ids) : <span className="suave">Ninguna</span>}</span>}</td>
                            <td className="suave">{formatoFecha(i.creada_en, zona)}</td>
                            <td>
                              <form action={revocarInvitacion}>
                                <input type="hidden" name="id" value={i.id} />
                                <button className="btn chico" type="submit" aria-label={`Revocar la invitación de ${i.email}`}>Revocar</button>
                              </form>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        );
      })()}

      {pestana === 'permisos' && permisos && (() => {
        const tiene = new Set(unir<{ rol: string; modulo: string }>(permisos as never, 'los permisos').map((f) => `${f.rol}/${f.modulo}`));
        return (
          <>
            <p className="suave">{admin ? 'Marca o desmarca para cambiar lo que ve cada rol. El cambio se aplica en la próxima visita de las personas con ese rol.' : 'Solo un Administrador puede cambiar permisos.'}</p>
            <div className="tablewrap">
              <table className="tabla matriz">
                <caption className="sr">Secciones visibles por rol</caption>
                <thead><tr><th>Sección</th>{ROLES.map((r) => <th key={r}>{ETIQUETA_ROL[r]}</th>)}</tr></thead>
                <tbody>
                  {MODULOS.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">{m.nombre}</th>
                      {ROLES.map((r) => {
                        const fijo = permisoFijo(r, m.id), marcada = tiene.has(`${r}/${m.id}`);
                        return (
                          <td key={r}>
                            <form action={cambiarPermiso}>
                              <input type="hidden" name="rol" value={r} />
                              <input type="hidden" name="modulo" value={m.id} />
                              <input type="hidden" name="activo" value={marcada ? '1' : '0'} />
                              <CasillaAuto etiqueta={`${m.nombre} para ${ETIQUETA_ROL[r]}`} marcada={marcada} deshabilitada={!admin || fijo !== null} titulo={fijo ?? undefined} />
                              {admin && fijo === null && <noscript><button className="btn chico" type="submit">Guardar</button></noscript>}
                            </form>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        );
      })()}
    </section>
  );
}
