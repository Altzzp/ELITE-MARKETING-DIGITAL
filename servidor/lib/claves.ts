// Sin importaciones: lo usan la ruta de IA, la aplicación y las pruebas.

/** Una clave de servicio (que se salta RLS) puesta por error como ANON dejaría sin efecto toda la seguridad: se rechaza. */
export function esClaveDeServicio(clave: string): boolean {
  if (clave.startsWith('sb_secret_')) return true;
  try {
    const payload = JSON.parse(Buffer.from(clave.split('.')[1] ?? '', 'base64url').toString('utf8')) as { role?: unknown };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}
