'use client';
// Abre el cuadro de impresión del navegador (desde ahí se puede «Guardar como PDF»). La hoja de estilos de impresión oculta menús y botones.
export default function BotonImprimir() {
  return <button type="button" className="btn no-imprimir" onClick={() => window.print()}>Imprimir o guardar PDF</button>;
}
