// Piezas visuales de "Información de marcas". Sin estilos en línea (la CSP no los permite): los colores van como atributos de SVG,
// que solo reciben códigos #RRGGBB ya validados (hexValido) y nunca texto libre.
import { colorSobre, hexValido, inicialesMarca, type Marca } from '../lib/marcas.ts';

const FONDO_NEUTRO = '#8B1B88';
const colorPrincipal = (m: Pick<Marca, 'paleta'>): string => (hexValido(m.paleta[0]?.hex) ? m.paleta[0]!.hex : FONDO_NEUTRO);

/** Cuadro con las iniciales de la marca sobre su color principal. */
export function AvatarMarca({ marca, tam = 40 }: { marca: Pick<Marca, 'nombre' | 'paleta'>; tam?: number }) {
  const fondo = colorPrincipal(marca), letras = inicialesMarca(marca.nombre);
  return (
    <svg className="avatar-marca" width={tam} height={tam} viewBox="0 0 40 40" role="img" aria-label={`Avatar de ${marca.nombre}`}>
      <rect width="40" height="40" rx="11" fill={fondo} />
      <text x="20" y="25.5" textAnchor="middle" fontSize="15" fontWeight="700" fill={colorSobre(fondo)} fontFamily="Inter, system-ui, sans-serif">{letras}</text>
    </svg>
  );
}

/** Franja con los colores de la paleta (decorativa: los nombres y códigos están en la ficha). */
export function FranjaPaleta({ paleta }: { paleta: Marca['paleta'] }) {
  const colores = paleta.filter((p) => hexValido(p.hex));
  if (colores.length === 0) return <svg className="franja" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="8" fill="#D6CADA" /></svg>;
  const ancho = 100 / colores.length;
  return (
    <svg className="franja" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
      {colores.map((p, i) => <rect key={`${p.hex}-${i}`} x={i * ancho} width={ancho + 0.2} height="8" fill={p.hex} />)}
    </svg>
  );
}

/** Muestra de un color con su nombre y código. */
export function Muestra({ nombre, hex }: { nombre: string; hex: string }) {
  return (
    <figure className="muestra">
      <svg width="100%" height="56" viewBox="0 0 120 56" preserveAspectRatio="none" role="img" aria-label={`Color ${nombre} ${hex}`}>
        <rect width="120" height="56" rx="10" fill={hex} stroke="#00000022" />
      </svg>
      <figcaption><b>{nombre}</b><code>{hex}</code></figcaption>
    </figure>
  );
}
