// Política web común: CSP, cookies de sesión y URL pública. Sin importaciones: se prueba con node --test.

export const SESION_DIAS = 14;   // la sesión se renueva con el uso; tras este tiempo sin entrar hay que iniciar sesión otra vez

/** CSP con nonce por petición. Next añade el nonce a sus propios scripts y estilos cuando la cabecera viaja también en la petición. */
export function construirCsp(nonce: string, desarrollo: boolean, https = true): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${desarrollo ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(desarrollo || !https ? [] : ['upgrade-insecure-requests']),   // en http://localhost (pruebas) subirlo a https rompe hasta el favicon
  ].join('; ');
}

type Opciones = Record<string, unknown> & { maxAge?: number };

/** Cookies de sesión: solo el servidor las lee (HttpOnly), no viajan entre sitios (SameSite) y, en producción, solo por HTTPS. */
export function opcionesCookie(opciones: Opciones = {}, produccion = process.env['NODE_ENV'] === 'production') {
  const tope = SESION_DIAS * 24 * 3600;
  return {
    ...opciones,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: produccion,
    path: '/',
    maxAge: typeof opciones.maxAge === 'number' ? Math.min(opciones.maxAge, tope) : tope,   // maxAge 0 = borrar: se respeta
  };
}

/** URL pública de la aplicación (para los enlaces de los correos). Sale de la configuración, nunca de las cabeceras de la petición. */
export function urlApp(entorno: Record<string, string | undefined> = process.env): string {
  const bruta = entorno['APP_URL']?.trim();
  const produccion = entorno['NODE_ENV'] === 'production';
  if (!bruta) {
    if (produccion) throw new Error('Falta APP_URL (la dirección pública de la aplicación, con https://)');
    return 'http://localhost:3000';
  }
  let u: URL;
  try { u = new URL(bruta); } catch { throw new Error('APP_URL no es una dirección válida'); }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (produccion && u.protocol !== 'https:' && !local) throw new Error('APP_URL debe empezar con https:// en producción');
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('APP_URL debe ser http o https');
  return u.origin;
}
