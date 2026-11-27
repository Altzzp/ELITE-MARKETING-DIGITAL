// Reglas de seguridad del acceso. Sin importaciones y sin Next: se prueban directamente con node --test.

export const LIMITE_CLAVE_MIN = 10;
export const LIMITE_CLAVE_MAX_BYTES = 72;   // bcrypt (lo que usa Supabase) ignora lo que pase de 72 bytes

/** Destinos permitidos después de iniciar sesión: solo rutas internas. Evita redirecciones abiertas (?next=https://sitio-malo.com). */
export function rutaSegura(destino: unknown, porDefecto = '/panel'): string {
  if (typeof destino !== 'string') return porDefecto;
  const d = destino.trim();
  if (d.length === 0 || d.length > 300 || !d.startsWith('/')) return porDefecto;
  if (/[\u0000-\u001f\u007f\\]/.test(d)) return porDefecto;                       // controles y contrabarra: algunos navegadores las tratan como "/"
  let dec: string;
  try { dec = decodeURIComponent(d); } catch { return porDefecto; }
  if (/^\/[\/\\]/.test(dec) || /[\u0000-\u001f\u007f\\]/.test(dec)) return porDefecto;   // "/%2F/sitio" o "/%5Csitio" decodifican a algo externo
  try {
    const u = new URL(d, 'http://interno.invalid');
    if (u.origin !== 'http://interno.invalid' || u.pathname.startsWith('//')) return porDefecto;
    return u.pathname + u.search;                                                  // el fragmento (#…) no viaja al servidor
  } catch { return porDefecto; }
}

export function normalizarCorreo(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : '';
}

export function correoValido(correo: string): boolean {
  return correo.length <= 254 && /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]{2,}$/.test(correo) && !correo.includes('..');
}

export function normalizarNombre(v: unknown): string {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

export function nombreValido(nombre: string): boolean {
  return nombre.length >= 2 && nombre.length <= 80;
}

const COMUNES = new Set([
  '1234567890', '12345678910', '0123456789', '0987654321', 'qwertyuiop', '1q2w3e4r5t', 'asdfghjkl1', 'abcdefghij', 'abcd123456',
  'contrasena1', 'contrasena12', 'contrasena123', 'contrasena1234', 'micontrasena', 'mi contrasena', 'password12', 'password123', 'password1234', 'passw0rd123',
  'elitedigital', 'elitedigital1', 'elitedigital123', 'bienvenido1', 'bienvenido123', 'administrador', 'administrador1', 'administrador123',
]);

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Devuelve el motivo por el que la contraseña no sirve, o null si está bien. Supabase aplica su propia regla; esta da un mensaje claro antes de enviar. */
export function problemaDeClave(clave: string, correo = ''): string | null {
  if (clave.length < LIMITE_CLAVE_MIN) return `La contraseña debe tener al menos ${LIMITE_CLAVE_MIN} caracteres.`;
  if (new TextEncoder().encode(clave).length > LIMITE_CLAVE_MAX_BYTES) return `La contraseña es demasiado larga (máximo ${LIMITE_CLAVE_MAX_BYTES} caracteres).`;
  if (/^\d+$/.test(clave)) return 'No uses solo números.';
  if (/^(.)\1+$/u.test(clave)) return 'No uses el mismo carácter repetido.';
  const k = sinTildes(clave).toLowerCase();
  const c = sinTildes(correo).toLowerCase();
  if (COMUNES.has(k)) return 'Esa contraseña es muy común. Elige otra.';
  if (c && (k === c || (c.includes('@') && k === c.split('@')[0]))) return 'No uses tu correo como contraseña.';
  return null;
}

export type ErrorAuth = { code?: string | undefined; status?: number | undefined; message?: string | undefined; name?: string | undefined } | null | undefined;

export const MENSAJES = {
  credenciales: 'Correo o contraseña incorrectos.',
  sinConfirmar: 'Primero confirma tu correo: te enviamos un enlace al registrarte.',
  limite: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  red: 'No pudimos conectar con el servicio. Inténtalo de nuevo en unos minutos.',
  generico: 'No pudimos completar la acción. Inténtalo de nuevo.',
  suspendida: 'Tu cuenta está suspendida. Habla con el administrador de la agencia.',
  sinPerfil: 'Tu cuenta aún no está activada en la agencia. Pide al administrador que te envíe una invitación.',
  registro: 'No pudimos crear tu cuenta. Usa el mismo correo al que llegó tu invitación o pide una nueva al administrador.',
  claveDebil: 'Esa contraseña es muy fácil de adivinar. Elige otra más larga o menos común.',
  claveIgual: 'Elige una contraseña distinta de la anterior.',
  enlaceInvalido: 'El enlace no es válido o ya venció. Pide uno nuevo.',
  recuperacion: 'Si ese correo tiene una cuenta, te enviamos un enlace para cambiar la contraseña. Revisa también la carpeta de spam.',
  registroEnviado: 'Te enviamos un correo para confirmar tu cuenta. Ábrelo y sigue el enlace para entrar.',
} as const;

const esLimite = (e: NonNullable<ErrorAuth>) =>
  e.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit', 'over_sms_send_rate_limit'].includes(e.code ?? '');
const esRed = (e: NonNullable<ErrorAuth>) =>
  e.status === 0 || (e.status !== undefined && e.status >= 502 && e.status <= 504) || e.name === 'AuthRetryableFetchError';

/** Traduce los errores de Supabase Auth a un mensaje que no revele si una cuenta existe ni detalles internos. */
export function mensajeAuth(accion: 'login' | 'registro' | 'clave', e: ErrorAuth): string {
  if (!e) return MENSAJES.generico;
  if (esLimite(e)) return MENSAJES.limite;
  // Sin invitación, el disparador de la base rechaza el alta y Supabase responde 500 "Database error saving new user" (supabase-js lo marca como reintentable).
  if (accion === 'registro' && (e.code === 'unexpected_failure' || /Database error saving new user/i.test(e.message ?? ''))) return MENSAJES.registro;
  if (esRed(e)) return MENSAJES.red;
  if (e.code === 'weak_password') return MENSAJES.claveDebil;
  if (e.code === 'same_password') return MENSAJES.claveIgual;
  if (accion === 'login') {
    if (e.code === 'email_not_confirmed') return MENSAJES.sinConfirmar;
    if (e.code === 'user_banned') return MENSAJES.suspendida;
    if (e.code === 'invalid_credentials' || e.status === 400) return MENSAJES.credenciales;
    return MENSAJES.generico;
  }
  if (accion === 'registro') return MENSAJES.registro;   // incluye "no hay invitación" y "ya existe": mismo texto para no revelar nada
  return MENSAJES.generico;
}

/** Mensajes que la página de ingreso muestra según ?e=… Solo se aceptan códigos de esta lista: nunca se imprime texto de la URL. */
export const AVISOS_LOGIN: Record<string, { tipo: 'ok' | 'error'; texto: string }> = {
  salio: { tipo: 'ok', texto: 'Cerraste sesión.' },
  clave: { tipo: 'ok', texto: 'Contraseña actualizada. Ya puedes entrar con la nueva.' },
  enlace: { tipo: 'error', texto: MENSAJES.enlaceInvalido },
  suspendida: { tipo: 'error', texto: MENSAJES.suspendida },
  sinperfil: { tipo: 'error', texto: MENSAJES.sinPerfil },
};

export const AVISOS_PANEL: Record<string, { tipo: 'ok' | 'error'; texto: string }> = {
  'sin-acceso': { tipo: 'error', texto: 'Tu rol no tiene acceso a esa sección.' },
  clave: { tipo: 'ok', texto: 'Contraseña actualizada.' },
};
