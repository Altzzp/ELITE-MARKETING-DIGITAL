'use client';
// Controles que envían su formulario al cambiar (rol de una persona, permiso de un rol). Sin JavaScript el formulario trae un botón "Guardar" (<noscript>).

export function SelectorAuto({ name, valor, etiqueta, opciones }: { name: string; valor: string; etiqueta: string; opciones: readonly { valor: string; texto: string }[] }) {
  return (
    <select className="sel" name={name} defaultValue={valor} aria-label={etiqueta} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
    </select>
  );
}

/** La casilla pone en el campo oculto "activo" el valor que eligió la persona (1 o 0) y envía; así un envío desactualizado no invierte nada. */
export function CasillaAuto({ etiqueta, marcada, deshabilitada, titulo }: { etiqueta: string; marcada: boolean; deshabilitada: boolean; titulo?: string }) {
  return (
    <input
      type="checkbox" className="cb" aria-label={etiqueta} title={titulo} defaultChecked={marcada} disabled={deshabilitada}
      onChange={(e) => {
        const f = e.currentTarget.form;
        if (!f) return;
        (f.elements.namedItem('activo') as HTMLInputElement).value = e.currentTarget.checked ? '1' : '0';
        f.requestSubmit();
      }}
    />
  );
}
