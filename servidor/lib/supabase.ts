import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { configSupabase } from './config.ts';
import { opcionesCookie } from './web.ts';

/** Cliente de Supabase con la sesión de la persona (cookies HttpOnly). Úsalo en Server Components, acciones y rutas. */
export async function clienteServidor() {
  const { url, clave } = configSupabase();
  const almacen = await cookies();
  return createServerClient(url, clave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (lista) => {
        try { for (const { name, value, options } of lista) almacen.set(name, value, opcionesCookie(options)); }
        catch { /* En un Server Component no se pueden escribir cookies: la renovación la hace proxy.ts */ }
      },
    },
  });
}

/** signUp y resetPasswordForEmail dejan una cookie "code-verifier" (PKCE) que aquí no se usa: los enlaces de correo se canjean con token_hash. Se borra para no dejar cookies de 14 días sin función. */
export async function olvidarVerificadorPkce(): Promise<void> {
  const almacen = await cookies();
  for (const c of almacen.getAll()) if (c.name.endsWith('code-verifier')) almacen.delete(c.name);
}
