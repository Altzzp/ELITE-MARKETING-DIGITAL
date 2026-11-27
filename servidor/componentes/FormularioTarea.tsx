'use client';
// Formulario de crear y editar una pieza del Tablero. Funciona sin JavaScript (envío normal del formulario); con JavaScript, tras un error
// conserva lo escrito, marca los campos con problemas y lleva el foco al primero.
import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Aviso } from './Avisos';
import { FORMATOS, etiquetaFormato } from '../lib/panel.ts';
import { LIMITE, type EstadoFormTarea, type ValoresTarea } from '../lib/tablero.ts';

type Accion = (previo: EstadoFormTarea, form: FormData) => Promise<EstadoFormTarea>;
type Props = {
  modo: 'crear' | 'editar';
  accion: Accion;
  inicial: ValoresTarea;
  marcas: { id: string; nombre: string }[];
  disenadores: { id: string; nombre: string }[];
  puedeElegirResponsable: boolean;
  tareaId?: string;
  volver: string;
};

function Error({ id, texto }: { id: string; texto: string | undefined }) {
  return texto ? <small id={id} className="campo-error" role="alert">{texto}</small> : null;
}

export default function FormularioTarea({ modo, accion, inicial, marcas, disenadores, puedeElegirResponsable, tareaId, volver }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, { errores: {} } satisfies EstadoFormTarea);
  const v = estado.valores ?? inicial, e = estado.errores;
  const hayErrores = Object.keys(e).length > 0;
  const raiz = useRef<HTMLFormElement>(null);
  useEffect(() => { if (hayErrores) raiz.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [estado, hayErrores]);
  const inv = (k: string) => (e[k] ? true : undefined);
  const desc = (k: string) => (e[k] ? `err-${k}` : undefined);

  // Los <select> llevan `key` con su valor: React 19 reinicia el formulario tras cada envío y un <select> no actualiza su valor por defecto al re-renderizar.
  return (
    <form ref={raiz} action={enviar} noValidate className="form ficha-form" aria-busy={pendiente}>
      {tareaId && <input type="hidden" name="id" value={tareaId} />}
      {hayErrores && <Aviso tipo="error">Revisa los campos marcados y vuelve a intentarlo.</Aviso>}
      <fieldset className="bloque-form">
        <legend>{modo === 'crear' ? 'Datos de la tarea' : 'Editar la tarea'}</legend>
        <div className="campo">
          <label htmlFor="t-titulo">Título *</label>
          <input id="t-titulo" name="titulo" maxLength={LIMITE.titulo} defaultValue={v.titulo} autoComplete="off" placeholder="Ej. Reel de lanzamiento de temporada" aria-invalid={inv('titulo')} aria-describedby={desc('titulo')} />
          <Error id="err-titulo" texto={e['titulo']} />
        </div>
        {modo === 'crear' && (
          <div className="campo">
            <label htmlFor="t-marca">Marca *</label>
            <select key={`marca-${v.marca}`} id="t-marca" name="marca" className="sel" defaultValue={v.marca} aria-invalid={inv('marca')} aria-describedby={desc('marca')}>
              <option value="">Elige una marca…</option>
              {marcas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
            <Error id="err-marca" texto={e['marca']} />
          </div>
        )}
        <div className="fila-form">
          <div className="campo">
            <label htmlFor="t-formato">Formato *</label>
            <select key={`formato-${v.formato}`} id="t-formato" name="formato" className="sel" defaultValue={v.formato} aria-invalid={inv('formato')} aria-describedby={desc('formato')}>
              <option value="">Elige un formato…</option>
              {FORMATOS.map((f) => <option key={f} value={f}>{etiquetaFormato(f)}</option>)}
            </select>
            <Error id="err-formato" texto={e['formato']} />
          </div>
          <div className="campo">
            <label htmlFor="t-fecha">Fecha de publicación *</label>
            <input id="t-fecha" name="fecha" type="date" defaultValue={v.fecha} aria-invalid={inv('fecha')} aria-describedby={desc('fecha')} />
            <Error id="err-fecha" texto={e['fecha']} />
          </div>
        </div>
        {puedeElegirResponsable ? (
          <div className="campo">
            <label htmlFor="t-responsable">Responsable</label>
            <select key={`resp-${v.responsable}`} id="t-responsable" name="responsable" className="sel" defaultValue={v.responsable} aria-invalid={inv('responsable')} aria-describedby={desc('responsable')}>
              <option value="">{modo === 'crear' ? 'Automático: el diseñador con menos piezas abiertas' : 'Sin responsable'}</option>
              {disenadores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <small>Solo aparecen diseñadores activos con acceso a la marca.</small>
            <Error id="err-responsable" texto={e['responsable']} />
          </div>
        ) : <p className="suave">La pieza quedará a tu cargo.</p>}
      </fieldset>
      <div className="acciones-form">
        <button className="btn primario" type="submit" disabled={pendiente}>{modo === 'crear' ? 'Crear tarea' : 'Guardar cambios'}</button>
        <Link className="btn" href={volver}>Cancelar</Link>
      </div>
    </form>
  );
}
