// Reglas de "Información de marcas". Sin importaciones externas (solo tipos): se prueba con node --test.
// Los límites y mensajes coinciden con la migración 0007; la base de datos los exige también (esto solo da el aviso junto al campo).
import type { Rol } from './modulos.ts';
import { esUuid } from './usuarios.ts';

export const LIMITE = { nombre: 60, corto: 24, sector: 60, cliente: 60, contacto: 60, publico: 400, tono: 160, brief: 3000, colorNombre: 30, tipografia: 40, usuario: 80 } as const;

export const REDES = ['Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Pinterest'] as const;
export type Red = (typeof REDES)[number];
export const esRed = (x: unknown): x is Red => typeof x === 'string' && (REDES as readonly string[]).includes(x);

export const HUECOS_PALETA = [
  { etiqueta: 'Color principal', nombre: 'Principal', hex: '#1F2A44' },
  { etiqueta: 'Color secundario', nombre: 'Secundario', hex: '#E0793A' },
  { etiqueta: 'Color de acento', nombre: 'Acento', hex: '#5B7DB1' },
  { etiqueta: 'Fondo claro', nombre: 'Fondo', hex: '#F1EEE8' },
] as const;

export const TIPOGRAFIAS_SUGERIDAS = ['Inter', 'Fraunces', 'DM Serif Display', 'Playfair Display', 'Cormorant Garamond', 'Archivo Black', 'Montserrat', 'Poppins', 'Lora', 'Space Grotesk'] as const;
export const TIPOGRAFIA_POR_DEFECTO = 'Inter';

/** Valor de la lista de clientes que significa "crear uno nuevo". */
export const CLIENTE_NUEVO = '__nuevo__';

// ── Permisos (la base de datos los exige igual; esto solo evita mostrar controles que no funcionarían) ──
export const puedeCrearMarcas = (r: Rol): boolean => r === 'administrador' || r === 'direccion';
export const puedeArchivarMarcas = puedeCrearMarcas;
export const puedeEditarFichas = (r: Rol): boolean => r === 'administrador' || r === 'direccion' || r === 'community_manager';
export const puedeEliminarMarcas = (r: Rol): boolean => r === 'administrador';
export const puedeDarAcceso = (r: Rol): boolean => r === 'administrador';

// ── Colores ──
const HEX = /^#[0-9a-f]{6}$/i;
export const hexValido = (x: unknown): x is string => typeof x === 'string' && HEX.test(x);

function canal(v: number): number { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }
/** Luminancia relativa (WCAG) de un color #RRGGBB. */
export function luminancia(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
}
/** Relación de contraste (1 a 21) entre dos colores #RRGGBB. */
export function contraste(a: string, b: string): number {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** Blanco o casi negro, el que más contraste dé sobre ese fondo (para las letras de un avatar o una muestra de color). */
export function colorSobre(fondo: string): string {
  return hexValido(fondo) && contraste(fondo, '#FFFFFF') >= contraste(fondo, '#111111') ? '#FFFFFF' : '#111111';
}

/** Los títulos de las portadas usan el color principal sobre el fondo claro: con menos de 3:1 cuesta leerlos. */
export function contrasteBajo(paleta: readonly { hex: string }[]): boolean {
  const principal = paleta[0]?.hex, fondo = paleta[3]?.hex;
  return hexValido(principal) && hexValido(fondo) && contraste(principal, fondo) < 3;
}

/** Nombre corto por defecto: el propio nombre si cabe en 14 letras, si no su primera palabra. */
export function nombreCorto(nombre: string): string {
  const t = nombre.trim();
  return t.length <= 14 ? t : (t.split(/\s+/)[0] ?? t);
}

/** Iniciales para el avatar de una marca. */
export function inicialesMarca(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = (palabras.length > 1 ? palabras.slice(0, 2).map((p) => [...p][0]!) : [...(palabras[0] ?? '?')].slice(0, 2)).join('');
  return letras.toUpperCase();
}

// ── La ficha tal como la maneja el formulario ──
export type ValoresFicha = {
  nombre: string; corto: string; sector: string;
  cliente: string; clienteNuevo: string; clienteContacto: string;
  paleta: { nombre: string; hex: string }[];
  tipografias: { titulos: string; textos: string };
  redes: { red: string; usuario: string }[];
  tono: string; publico: string; brief: string;
};
export type ErroresFicha = Record<string, string>;
export type EstadoFormulario = { errores: ErroresFicha; valores?: ValoresFicha };

export const NUM_COLORES = HUECOS_PALETA.length;
export const NUM_REDES = REDES.length;

/** Ficha en blanco. Sin clientes todavía, el formulario arranca en "cliente nuevo". */
export function valoresIniciales(hayClientes: boolean): ValoresFicha {
  return {
    nombre: '', corto: '', sector: '',
    cliente: hayClientes ? '' : CLIENTE_NUEVO, clienteNuevo: '', clienteContacto: '',
    paleta: HUECOS_PALETA.map((h) => ({ nombre: h.nombre, hex: h.hex })),
    tipografias: { titulos: TIPOGRAFIA_POR_DEFECTO, textos: TIPOGRAFIA_POR_DEFECTO },
    redes: REDES.map((red) => ({ red, usuario: '' })),
    tono: '', publico: '', brief: '',
  };
}

const texto = (x: unknown): string => (typeof x === 'string' ? x : '');
const limpiar = (s: string): string => s.replaceAll('\u0000', '').trim();

/** Una marca tal como llega de la base de datos (jsonb sin garantías de forma). */
export type Marca = {
  id: string; clienteId: string; nombre: string; corto: string; sector: string; publico: string; tono: string; brief: string;
  paleta: { nombre: string; hex: string }[]; tipografias: { titulos: string; textos: string }; redes: { red: Red; usuario: string }[];
  activa: boolean;
};

/** Fila de `marcas` → Marca. Lo que no tiene la forma esperada se descarta o se rellena con lo neutro; nunca se deja pasar un color sin validar. */
export function leerMarca(x: unknown): Marca | null {
  if (typeof x !== 'object' || x === null) return null;
  const f = x as Record<string, unknown>;
  const id = texto(f['id']), nombre = texto(f['nombre']);
  if (!esUuid(id) || !nombre) return null;
  const paleta = (Array.isArray(f['paleta']) ? f['paleta'] : []).flatMap((p: unknown) => {
    const o = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
    return hexValido(o['hex']) ? [{ nombre: texto(o['nombre']), hex: o['hex'].toUpperCase() }] : [];
  }).slice(0, NUM_COLORES);
  const t = (typeof f['tipografias'] === 'object' && f['tipografias'] !== null ? f['tipografias'] : {}) as Record<string, unknown>;
  const redes = (Array.isArray(f['redes']) ? f['redes'] : []).flatMap((r: unknown) => {
    const o = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>;
    return esRed(o['red']) && texto(o['usuario']) ? [{ red: o['red'], usuario: texto(o['usuario']) }] : [];
  }).slice(0, NUM_REDES);
  return {
    id, clienteId: texto(f['cliente_id']), nombre, corto: texto(f['nombre_corto']) || nombreCorto(nombre), sector: texto(f['sector']),
    publico: texto(f['publico_objetivo']), tono: texto(f['tono']), brief: texto(f['brief']),
    paleta, tipografias: { titulos: texto(t['display']) || TIPOGRAFIA_POR_DEFECTO, textos: texto(t['body']) || TIPOGRAFIA_POR_DEFECTO },
    redes, activa: f['activa'] !== false,
  };
}

/** Marca guardada → valores del formulario de edición (siempre con 4 colores y 5 filas de redes). */
export function valoresDeMarca(m: Marca): ValoresFicha {
  const base = valoresIniciales(false);
  const usadas = new Set<string>(m.redes.map((r) => r.red));
  const libres = REDES.filter((r) => !usadas.has(r));
  const filas = [...m.redes.map((r) => ({ red: r.red as string, usuario: r.usuario })), ...libres.map((r) => ({ red: r as string, usuario: '' }))].slice(0, NUM_REDES);
  return {
    ...base,
    nombre: m.nombre, corto: m.corto === nombreCorto(m.nombre) ? '' : m.corto, sector: m.sector,
    cliente: m.clienteId,
    paleta: HUECOS_PALETA.map((h, i) => ({ nombre: m.paleta[i]?.nombre || h.nombre, hex: m.paleta[i]?.hex ?? h.hex })),
    tipografias: m.tipografias,
    redes: filas,
    tono: m.tono, publico: m.publico, brief: m.brief,
  };
}

/** Lector mínimo (FormData lo cumple). */
export type Lector = { get(k: string): unknown };

/** Lo que llegó del formulario, limpio (espacios, saltos de línea del navegador, caracteres que la base no admite). No valida: de eso se encarga `validarFicha`. */
export function leerFicha(f: Lector): ValoresFicha {
  const t = (k: string) => limpiar(texto(f.get(k)));
  const largo = (k: string) => limpiar(texto(f.get(k)).replace(/\r\n?/g, '\n'));   // los navegadores envían los saltos de línea como \r\n
  return {
    nombre: t('nombre'), corto: t('corto'), sector: t('sector'),
    cliente: t('cliente'), clienteNuevo: t('cliente_nuevo'), clienteContacto: t('cliente_contacto'),
    paleta: HUECOS_PALETA.map((h, i) => ({ nombre: t(`color_nombre_${i}`) || h.nombre, hex: t(`color_hex_${i}`).toUpperCase() })),
    tipografias: { titulos: t('tipografia_titulos') || TIPOGRAFIA_POR_DEFECTO, textos: t('tipografia_textos') || TIPOGRAFIA_POR_DEFECTO },
    redes: REDES.map((_, i) => ({ red: t(`red_${i}`), usuario: t(`usuario_${i}`) })),
    tono: t('tono'), publico: largo('publico'), brief: largo('brief'),
  };
}

/** Errores por campo (clave = campo). Vacío si todo está bien. `clientes` = ids de los clientes que la persona puede elegir al crear. */
export function validarFicha(v: ValoresFicha, modo: 'crear' | 'editar', clientes: readonly string[] = []): ErroresFicha {
  const e: ErroresFicha = {};
  if (!v.nombre) e['nombre'] = 'Escribe el nombre de la marca.';
  else if (v.nombre.length > LIMITE.nombre) e['nombre'] = `El nombre admite hasta ${LIMITE.nombre} caracteres.`;
  if (v.corto.length > LIMITE.corto) e['corto'] = `El nombre corto admite hasta ${LIMITE.corto} caracteres.`;
  if (!v.sector) e['sector'] = 'Indica el sector o rubro.';
  else if (v.sector.length > LIMITE.sector) e['sector'] = `El sector admite hasta ${LIMITE.sector} caracteres.`;

  if (modo === 'crear') {
    if (v.cliente === CLIENTE_NUEVO) {
      if (!v.clienteNuevo) e['clienteNuevo'] = 'Escribe el nombre del cliente.';
      else if (v.clienteNuevo.length > LIMITE.cliente) e['clienteNuevo'] = `El nombre del cliente admite hasta ${LIMITE.cliente} caracteres.`;
      if (v.clienteContacto.length > LIMITE.contacto) e['clienteContacto'] = `El contacto admite hasta ${LIMITE.contacto} caracteres.`;
    } else if (esUuid(v.cliente) && clientes.includes(v.cliente.toLowerCase())) {
      if (v.clienteNuevo || v.clienteContacto) e['clienteNuevo'] = 'Para un cliente nuevo elige «Nuevo cliente» en la lista. Si el cliente ya existe, deja estos campos vacíos.';
    } else {
      e['cliente'] = 'Elige un cliente de la lista o crea uno nuevo.';
    }
  }

  v.paleta.forEach((p, i) => {
    if (!hexValido(p.hex)) e[`color_${i}`] = 'Escribe el color como #RRGGBB, por ejemplo #1F2A44.';
    else if (p.nombre.length > LIMITE.colorNombre) e[`color_${i}`] = `El nombre del color admite hasta ${LIMITE.colorNombre} caracteres.`;
  });

  if (v.tipografias.titulos.length > LIMITE.tipografia) e['tipografia_titulos'] = `La tipografía admite hasta ${LIMITE.tipografia} caracteres.`;
  if (v.tipografias.textos.length > LIMITE.tipografia) e['tipografia_textos'] = `La tipografía admite hasta ${LIMITE.tipografia} caracteres.`;

  const vistas = new Set<string>();
  v.redes.forEach((r, i) => {
    if (!r.usuario) return;   // fila vacía: no se guarda
    if (!esRed(r.red)) e[`red_${i}`] = 'Elige una de las redes de la lista.';
    else if (r.usuario.length > LIMITE.usuario) e[`red_${i}`] = `El usuario admite hasta ${LIMITE.usuario} caracteres.`;
    else if (vistas.has(r.red)) e[`red_${i}`] = `${r.red} ya está en otra fila.`;
    else vistas.add(r.red);
  });

  if (v.tono.length > LIMITE.tono) e['tono'] = `El tono admite hasta ${LIMITE.tono} caracteres.`;
  if (v.publico.length > LIMITE.publico) e['publico'] = `El público objetivo admite hasta ${LIMITE.publico} caracteres.`;
  if (v.brief.length > LIMITE.brief) e['brief'] = `El brief admite hasta ${LIMITE.brief} caracteres.`;
  return e;
}

/** Argumentos comunes de crear_marca y actualizar_marca (la ficha ya validada). */
export function argumentosFicha(v: ValoresFicha) {
  return {
    p_nombre: v.nombre, p_sector: v.sector, p_corto: v.corto,
    p_paleta: v.paleta.map((p) => ({ nombre: p.nombre, hex: p.hex })),
    p_tipografias: { display: v.tipografias.titulos, body: v.tipografias.textos },
    p_redes: v.redes.filter((r) => r.usuario).map((r) => ({ red: r.red, usuario: r.usuario })),
    p_publico: v.publico, p_tono: v.tono, p_brief: v.brief,
  };
}

// ── Avisos y errores de la base de datos ──
export type AvisoMarcas = { tipo: 'ok' | 'error'; texto: string };

/** Avisos tras una acción (la URL lleva solo el código; el texto sale de esta lista, nunca de la URL). */
export const AVISOS_MARCAS: Record<string, AvisoMarcas> = {
  creada: { tipo: 'ok', texto: 'Marca creada. Asígnala a las personas que deban verla en la pestaña Acceso.' },
  'creada-sin-acceso': { tipo: 'ok', texto: 'Marca creada.' },
  guardada: { tipo: 'ok', texto: 'Cambios guardados.' },
  archivada: { tipo: 'ok', texto: 'Marca archivada. Ya no aparece en el Panel ni en el trabajo diario; conserva su historial y puedes restaurarla cuando quieras.' },
  restaurada: { tipo: 'ok', texto: 'Marca restaurada.' },
  eliminada: { tipo: 'ok', texto: 'Marca eliminada.' },
  acceso: { tipo: 'ok', texto: 'Acceso actualizado.' },
  'sin-permiso': { tipo: 'error', texto: 'Tu rol no permite esta acción.' },
  'solo-admin': { tipo: 'error', texto: 'Solo un Administrador puede hacer esto.' },
  'no-marca': { tipo: 'error', texto: 'No encontramos esa marca. Quizá ya no existe o no tienes acceso a ella.' },
  'con-contenido': { tipo: 'error', texto: 'La marca tiene contenido (piezas, ideas, proyectos, conversaciones o archivos). Para no perderlo, archívala en lugar de eliminarla.' },
  'marca-archivada': { tipo: 'error', texto: 'Esta marca está archivada. Restáurala para poder editar su ficha.' },
  confirmar: { tipo: 'error', texto: 'Para eliminar la marca marca la casilla de confirmación.' },
  'persona-ajena': { tipo: 'error', texto: 'Alguna de las personas elegidas no pertenece a tu agencia.' },
  datos: { tipo: 'error', texto: 'Revisa los datos del formulario e inténtalo de nuevo.' },
  generico: { tipo: 'error', texto: 'No se pudo completar la acción. Inténtalo de nuevo; si sigue igual, avisa a soporte.' },
};

export type ErrorDeBase = { code?: string; message?: string } | null | undefined;
export type Traduccion = { campo: string; texto: string } | { aviso: keyof typeof AVISOS_MARCAS };

/** Traduce un error de las funciones de 0007 (o de sus índices únicos) a un error junto a un campo o a un código de aviso. */
export function traducirError(e: ErrorDeBase): Traduccion {
  const m = e?.message ?? '';
  if (e?.code === '23505' && /marcas_nombre_unico/.test(m)) return { campo: 'nombre', texto: 'Ya existe una marca con ese nombre (puede estar archivada).' };
  if (e?.code === '23505' && /clientes_nombre_unico/.test(m)) return { campo: 'clienteNuevo', texto: 'Ya existe un cliente con ese nombre; elígelo de la lista.' };
  if (/Ya existe una marca con ese nombre/i.test(m)) return { campo: 'nombre', texto: 'Ya existe una marca con ese nombre (puede estar archivada).' };
  if (/Ya existe un cliente con ese nombre/i.test(m)) return { campo: 'clienteNuevo', texto: 'Ya existe un cliente con ese nombre; elígelo de la lista.' };
  if (/Escribe el nombre del cliente|nombre del cliente/i.test(m)) return { campo: 'clienteNuevo', texto: 'Escribe el nombre del cliente (hasta 60 caracteres).' };
  if (/No encontramos a ese cliente|Elige un cliente de la lista/i.test(m)) return { campo: 'cliente', texto: 'Elige un cliente de la lista o crea uno nuevo.' };
  if (/Solo el administrador/i.test(m)) return { aviso: 'solo-admin' };
  if (e?.code === '42501' || /^Solo Administración/i.test(m)) return { aviso: 'sin-permiso' };
  if (/No encontramos esa marca/i.test(m)) return { aviso: 'no-marca' };
  if (/La marca tiene contenido/i.test(m)) return { aviso: 'con-contenido' };
  if (/no pertenece a tu agencia/i.test(m)) return { aviso: 'persona-ajena' };
  if (/admite hasta|Escribe el nombre de la marca|Indica el sector|paleta|tipograf|redes|red repetida|Cada red/i.test(m)) return { aviso: 'datos' };   // la validación de aquí lo habría atrapado antes: solo llega si alguien se saltó el formulario
  return { aviso: 'generico' };
}

// ── Direcciones ──
export const PESTANAS_MARCA = ['general', 'identidad', 'comunicacion', 'redes', 'brief', 'acceso'] as const;
export type PestanaMarca = (typeof PESTANAS_MARCA)[number];
export const esPestanaMarca = (x: unknown): x is PestanaMarca => typeof x === 'string' && (PESTANAS_MARCA as readonly string[]).includes(x);
export const ETIQUETA_PESTANA: Record<PestanaMarca, string> = {
  general: 'General', identidad: 'Identidad visual', comunicacion: 'Comunicación', redes: 'Redes', brief: 'Brief', acceso: 'Acceso',
};

/** Pestañas que ve cada rol: "Acceso" solo el Administrador. */
export const pestanasVisibles = (rol: Rol): readonly PestanaMarca[] => PESTANAS_MARCA.filter((p) => p !== 'acceso' || puedeDarAcceso(rol));

/** Dirección de /marcas con la marca elegida, la pestaña y el aviso (solo ids válidos y valores de listas conocidas). */
export function destinoMarcas(opts: { marca?: string | null; pestana?: PestanaMarca; aviso?: keyof typeof AVISOS_MARCAS } = {}): string {
  const q = new URLSearchParams();
  if (opts.marca && esUuid(opts.marca)) q.set('m', opts.marca.toLowerCase());
  if (opts.pestana && opts.pestana !== 'general') q.set('pestana', opts.pestana);
  if (opts.aviso) q.set(AVISOS_MARCAS[opts.aviso]!.tipo === 'error' ? 'e' : 'a', opts.aviso);
  const s = q.toString();
  return s ? `/marcas?${s}` : '/marcas';
}
