import type { Metadata } from 'next';
import { exigirModulo } from '../../../lib/sesion.ts';
import { guardarTema } from '../../../acciones/apariencia.ts';
import type { Tema } from '../../../lib/modulos.ts';
import { Aviso } from '../../../componentes/Avisos';

export const metadata: Metadata = { title: 'Apariencia' };

const OPCIONES: { id: Tema; titulo: string; texto: string }[] = [
  { id: 'sistema', titulo: 'Automático', texto: 'Sigue el modo claro u oscuro de tu dispositivo.' },
  { id: 'claro', titulo: 'Claro', texto: 'Fondo claro, el más cómodo con mucha luz.' },
  { id: 'oscuro', titulo: 'Oscuro', texto: 'Fondo oscuro, descansa la vista de noche.' },
];
const AVISOS: Record<string, { tipo: 'ok' | 'error'; texto: string }> = {
  guardado: { tipo: 'ok', texto: 'Listo: tu apariencia quedó guardada y se aplica en todos tus dispositivos.' },
  datos: { tipo: 'error', texto: 'No pudimos entender tu elección. Inténtalo de nuevo.' },
  generico: { tipo: 'error', texto: 'No se pudo guardar. Inténtalo de nuevo; si sigue igual, avisa a soporte.' },
};

export default async function PaginaApariencia({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await exigirModulo('apariencia');
  const sp = await searchParams;
  const codigo = typeof sp['a'] === 'string' ? sp['a'] : typeof sp['e'] === 'string' ? sp['e'] : '';
  const aviso = Object.hasOwn(AVISOS, codigo) ? AVISOS[codigo]! : undefined;
  return (
    <section className="pagina">
      <h1>Apariencia</h1>
      <p className="suave">Elige cómo quieres ver la plataforma. Es una preferencia personal: no cambia lo que ven los demás.</p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <form action={guardarTema} className="form ficha-form">
        <fieldset className="bloque-form">
          <legend>Tema</legend>
          {OPCIONES.map((o) => (
            <label key={o.id} className="opcion-tema" htmlFor={`tema-${o.id}`}>
              <input id={`tema-${o.id}`} type="radio" name="tema" value={o.id} defaultChecked={s.perfil.tema === o.id} />
              <span><b>{o.titulo}</b><span className="suave">{o.texto}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="acciones-form"><button className="btn primario" type="submit">Guardar</button></div>
      </form>
    </section>
  );
}
