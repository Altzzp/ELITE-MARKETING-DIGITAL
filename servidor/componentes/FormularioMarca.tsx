'use client';
// Formulario de crear y editar una marca. Funciona sin JavaScript (envío normal del formulario); con JavaScript, tras un error conserva
// lo escrito, marca los campos con problemas y lleva el foco al primero.
import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Aviso } from './Avisos';
import {
  CLIENTE_NUEVO, HUECOS_PALETA, LIMITE, NUM_REDES, REDES, TIPOGRAFIAS_SUGERIDAS, type EstadoFormulario, type ValoresFicha,
} from '../lib/marcas.ts';

type Accion = (previo: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>;
type Props = {
  modo: 'crear' | 'editar';
  accion: Accion;
  inicial: ValoresFicha;
  clientes: { id: string; nombre: string }[];
  marcaId?: string;
  clienteActual?: string;
};

function Error({ id, texto }: { id: string; texto: string | undefined }) {
  return texto ? <small id={id} className="campo-error" role="alert">{texto}</small> : null;
}

export default function FormularioMarca({ modo, accion, inicial, clientes, marcaId, clienteActual }: Props) {
  const [estado, enviar, pendiente] = useActionState(accion, { errores: {} } satisfies EstadoFormulario);
  const v = estado.valores ?? inicial, e = estado.errores;
  const hayErrores = Object.keys(e).length > 0;
  const raiz = useRef<HTMLFormElement>(null);

  // Tras un envío con errores, el foco va al primer campo con problema (quien usa lector de pantalla oye también el aviso de arriba).
  useEffect(() => {
    if (hayErrores) raiz.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado, hayErrores]);

  // Los <select> llevan `key` con su valor: React 19 reinicia el formulario tras cada envío y, a diferencia de los campos de texto, un <select> no actualiza su valor por
  // defecto al re-renderizar; sin la clave volvería a mostrar la opción de la primera carga en lugar de la que la persona eligió.
  const inv = (k: string) => (e[k] ? true : undefined);
  const desc = (k: string) => (e[k] ? `err-${k}` : undefined);

  return (
    <form ref={raiz} action={enviar} noValidate className="form ficha-form" aria-busy={pendiente}>
      {marcaId && <input type="hidden" name="id" value={marcaId} />}
      {hayErrores && <Aviso tipo="error">Revisa los campos marcados y vuelve a intentarlo.</Aviso>}

      <fieldset className="bloque-form">
        <legend>Datos generales</legend>
        <div className="fila-form">
          <div className="campo">
            <label htmlFor="f-nombre">Nombre de la marca *</label>
            <input id="f-nombre" name="nombre" maxLength={LIMITE.nombre} defaultValue={v.nombre} autoComplete="off" aria-invalid={inv('nombre')} aria-describedby={desc('nombre')} />
            <Error id="err-nombre" texto={e['nombre']} />
          </div>
          <div className="campo">
            <label htmlFor="f-corto">Nombre corto</label>
            <input id="f-corto" name="corto" maxLength={LIMITE.corto} defaultValue={v.corto} autoComplete="off" placeholder="Ej. Quilla" aria-invalid={inv('corto')} aria-describedby={desc('corto')} />
            <small>Se usa en gráficos y avatares. Si lo dejas vacío se acorta solo.</small>
            <Error id="err-corto" texto={e['corto']} />
          </div>
        </div>
        <div className="campo">
          <label htmlFor="f-sector">Sector *</label>
          <input id="f-sector" name="sector" maxLength={LIMITE.sector} defaultValue={v.sector} autoComplete="off" placeholder="Ej. Café de especialidad" aria-invalid={inv('sector')} aria-describedby={desc('sector')} />
          <Error id="err-sector" texto={e['sector']} />
        </div>
        {modo === 'crear' ? (
          <>
            <div className="campo">
              <label htmlFor="f-cliente">Cliente *</label>
              <select key={`cliente-${v.cliente}`} id="f-cliente" name="cliente" className="sel" defaultValue={v.cliente} aria-invalid={inv('cliente')} aria-describedby={desc('cliente')}>
                <option value="">Elige un cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                <option value={CLIENTE_NUEVO}>＋ Nuevo cliente…</option>
              </select>
              <Error id="err-cliente" texto={e['cliente']} />
            </div>
            <div className="fila-form">
              <div className="campo">
                <label htmlFor="f-cliente-nuevo">Nombre del cliente nuevo</label>
                <input id="f-cliente-nuevo" name="cliente_nuevo" maxLength={LIMITE.cliente} defaultValue={v.clienteNuevo} autoComplete="off" aria-invalid={inv('clienteNuevo')} aria-describedby={desc('clienteNuevo')} />
                <small>Solo si elegiste «Nuevo cliente».</small>
                <Error id="err-clienteNuevo" texto={e['clienteNuevo']} />
              </div>
              <div className="campo">
                <label htmlFor="f-cliente-contacto">Contacto del cliente</label>
                <input id="f-cliente-contacto" name="cliente_contacto" maxLength={LIMITE.contacto} defaultValue={v.clienteContacto} autoComplete="off" placeholder="Nombre o correo" aria-invalid={inv('clienteContacto')} aria-describedby={desc('clienteContacto')} />
                <Error id="err-clienteContacto" texto={e['clienteContacto']} />
              </div>
            </div>
          </>
        ) : (
          <p className="suave">Cliente: <b>{clienteActual || '—'}</b>. El cliente de una marca no se cambia desde aquí.</p>
        )}
      </fieldset>

      <fieldset className="bloque-form">
        <legend>Identidad visual</legend>
        <div className="paleta-form">
          {HUECOS_PALETA.map((h, i) => (
            <div key={h.etiqueta} className="campo">
              <label htmlFor={`f-color-hex-${i}`}>{h.etiqueta}</label>
              <div className="color-par">
                <input id={`f-color-hex-${i}`} name={`color_hex_${i}`} type="color" defaultValue={(v.paleta[i]?.hex ?? h.hex).toLowerCase()} aria-invalid={inv(`color_${i}`)} aria-describedby={desc(`color_${i}`)} />
                <input name={`color_nombre_${i}`} maxLength={LIMITE.colorNombre} defaultValue={v.paleta[i]?.nombre ?? h.nombre} aria-label={`Nombre del color: ${h.etiqueta.toLowerCase()}`} autoComplete="off" aria-invalid={inv(`color_${i}`)} aria-describedby={desc(`color_${i}`)} />
              </div>
              <Error id={`err-color_${i}`} texto={e[`color_${i}`]} />
            </div>
          ))}
        </div>
        <datalist id="f-tipografias">{TIPOGRAFIAS_SUGERIDAS.map((t) => <option key={t} value={t} />)}</datalist>
        <div className="fila-form">
          <div className="campo">
            <label htmlFor="f-tip-titulos">Tipografía de títulos</label>
            <input id="f-tip-titulos" name="tipografia_titulos" list="f-tipografias" maxLength={LIMITE.tipografia} defaultValue={v.tipografias.titulos} autoComplete="off" aria-invalid={inv('tipografia_titulos')} aria-describedby={desc('tipografia_titulos')} />
            <Error id="err-tipografia_titulos" texto={e['tipografia_titulos']} />
          </div>
          <div className="campo">
            <label htmlFor="f-tip-textos">Tipografía de textos</label>
            <input id="f-tip-textos" name="tipografia_textos" list="f-tipografias" maxLength={LIMITE.tipografia} defaultValue={v.tipografias.textos} autoComplete="off" aria-invalid={inv('tipografia_textos')} aria-describedby={desc('tipografia_textos')} />
            <Error id="err-tipografia_textos" texto={e['tipografia_textos']} />
          </div>
        </div>
      </fieldset>

      <fieldset className="bloque-form">
        <legend>Comunicación</legend>
        <div className="campo">
          <label htmlFor="f-tono">Tono de comunicación</label>
          <input id="f-tono" name="tono" maxLength={LIMITE.tono} defaultValue={v.tono} autoComplete="off" placeholder="Ej. Cercano, curioso y con humor sutil" aria-invalid={inv('tono')} aria-describedby={desc('tono')} />
          <Error id="err-tono" texto={e['tono']} />
        </div>
        <div className="campo">
          <label htmlFor="f-publico">Público objetivo</label>
          <textarea id="f-publico" name="publico" rows={3} maxLength={LIMITE.publico} defaultValue={v.publico} placeholder="Ej. Mujeres de 25 a 40 años que cuidan su piel y compran en línea" aria-invalid={inv('publico')} aria-describedby={desc('publico')} />
          <Error id="err-publico" texto={e['publico']} />
        </div>
        <div className="campo">
          <label htmlFor="f-brief">Brief de la marca</label>
          <textarea id="f-brief" name="brief" rows={6} maxLength={LIMITE.brief} defaultValue={v.brief} placeholder="Qué vende, qué la diferencia, qué se debe evitar…" aria-invalid={inv('brief')} aria-describedby={desc('brief')} />
          <Error id="err-brief" texto={e['brief']} />
        </div>
      </fieldset>

      <fieldset className="bloque-form">
        <legend>Redes sociales</legend>
        <p className="suave">Completa solo las que use la marca; las filas sin usuario no se guardan.</p>
        {Array.from({ length: NUM_REDES }, (_, i) => (
          <div key={i} className="campo">
            <div className="red-par">
              <select key={`red-${i}-${v.redes[i]?.red ?? REDES[i]}`} name={`red_${i}`} className="sel" defaultValue={v.redes[i]?.red ?? REDES[i]} aria-label={`Red social ${i + 1}`}>
                {REDES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <input name={`usuario_${i}`} maxLength={LIMITE.usuario} defaultValue={v.redes[i]?.usuario ?? ''} placeholder="@usuario" autoComplete="off" autoCapitalize="none" spellCheck={false}
                aria-label={`Usuario de la red social ${i + 1}`} aria-invalid={inv(`red_${i}`)} aria-describedby={desc(`red_${i}`)} />
            </div>
            <Error id={`err-red_${i}`} texto={e[`red_${i}`]} />
          </div>
        ))}
      </fieldset>

      <div className="acciones-form">
        <button className="btn primario" type="submit" disabled={pendiente}>{pendiente ? 'Guardando…' : modo === 'crear' ? 'Crear marca' : 'Guardar cambios'}</button>
        <Link className="btn" href={marcaId ? `/marcas?m=${marcaId}` : '/marcas'}>Cancelar</Link>
      </div>
    </form>
  );
}
