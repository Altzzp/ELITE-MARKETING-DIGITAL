import type { Metadata } from 'next';
import Link from 'next/link';
import { exigirModulo } from '../../../lib/sesion.ts';
import { clienteServidor } from '../../../lib/supabase.ts';
import { ETIQUETA_ROL, MODULOS, ROLES, esModulo, esRol, type ModuloId, type Rol } from '../../../lib/modulos.ts';
import { Aviso } from '../../../componentes/Avisos';

export const metadata: Metadata = { title: 'Vista por rol' };

const DESCRIPCION_ROL: Record<Rol, string> = {
  administrador: 'Configura la agencia: usuarios, roles y permisos.',
  direccion: 'Ve todas las marcas y sus resultados.',
  community_manager: 'Gestiona las marcas que tiene asignadas.',
  disenador: 'Trabaja las piezas que tiene a su cargo.',
  cliente: 'Revisa y aprueba las piezas de su marca.',
};

export default async function PaginaVista() {
  const s = await exigirModulo('vista');
  let permisos: Map<Rol, Set<ModuloId>> | null = null;
  const r = await (await clienteServidor()).from('permisos_rol').select('rol,modulo').limit(500);
  if (r.error) console.error('[vista] no se pudieron cargar los permisos', r.error.code ?? '(sin código)');
  else {
    permisos = new Map(ROLES.map((x) => [x, new Set<ModuloId>()]));
    for (const f of (r.data ?? []) as { rol: unknown; modulo: unknown }[]) if (esRol(f.rol) && esModulo(f.modulo)) permisos.get(f.rol)!.add(f.modulo);
  }
  return (
    <section className="pagina ancha">
      <h1>Vista por rol</h1>
      <p className="suave">Qué secciones ve cada rol en tu agencia. Tu rol aparece marcado.{s.modulos.includes('usuarios') && <> Para cambiar los permisos, ve a <Link href="/usuarios">Usuarios y roles</Link>.</>}</p>
      {!permisos ? <Aviso tipo="error">No pudimos cargar los permisos. Recarga la página; si sigue igual, avisa a soporte.</Aviso> : (
        <div className="tablewrap">
          <table className="tabla matriz-vista">
            <caption className="sr">Secciones disponibles para cada rol</caption>
            <thead>
              <tr>
                <th scope="col">Sección</th>
                {ROLES.map((x) => <th key={x} scope="col" className={x === s.perfil.rol ? 'tu-rol' : undefined}>{ETIQUETA_ROL[x]}{x === s.perfil.rol && <><br /><span className="etiqueta etiqueta-info">Tu rol</span></>}</th>)}
              </tr>
              <tr>
                <td className="suave">Qué hace</td>
                {ROLES.map((x) => <td key={x} className="suave">{DESCRIPCION_ROL[x]}</td>)}
              </tr>
            </thead>
            <tbody>
              {MODULOS.map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.nombre}<br /><span className="suave">{m.descripcion}</span></th>
                  {ROLES.map((x) => {
                    const tiene = permisos!.get(x)!.has(m.id);
                    return <td key={x} className={x === s.perfil.rol ? 'tu-rol' : undefined}><span aria-hidden="true">{tiene ? '✓' : '—'}</span><span className="sr">{tiene ? 'Sí' : 'No'}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
