// Primera barrera: renueva la sesión, aplica la CSP y manda a /login a quien no la tiene. NO es la única defensa:
// cada página y acción vuelve a verificar la sesión (lib/sesion.ts) y la base de datos aplica RLS.
import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { configSupabase } from './lib/config.ts';
import { rutaSegura } from './lib/seguridad.ts';
import { construirCsp, opcionesCookie, urlApp } from './lib/web.ts';

const PUBLICAS = new Set(['/login', '/registro', '/recuperar']);   // con sesión iniciada se redirigen al panel

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const https = (() => { try { return urlApp().startsWith('https:'); } catch { return true; } })();   // sin APP_URL válida, lo más estricto
  const csp = construirCsp(nonce, process.env['NODE_ENV'] === 'development', https);
  const cabeceras = () => {
    const h = new Headers(request.headers);
    h.set('x-nonce', nonce); h.set('content-security-policy', csp);
    return h;
  };
  const marcar = (r: NextResponse) => { r.headers.set('content-security-policy', csp); r.headers.set('cache-control', 'private, no-store'); return r; };

  let respuesta = NextResponse.next({ request: { headers: cabeceras() } });
  const { url, clave } = configSupabase();
  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista, cabecerasCache) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request: { headers: cabeceras() } });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, opcionesCookie(options));
        for (const [k, v] of Object.entries(cabecerasCache ?? {})) respuesta.headers.set(k, v);
      },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error && (error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500 || error.status === 0)) {
    return marcar(new NextResponse('Servicio no disponible. Inténtalo de nuevo en unos minutos.', { status: 503 }));
  }

  const ruta = request.nextUrl.pathname;
  const redirigir = (destino: string) => {
    const r = NextResponse.redirect(new URL(destino, request.url));
    for (const c of respuesta.cookies.getAll()) r.cookies.set(c);   // conserva la sesión renovada
    return marcar(r);
  };
  const libre = ruta.startsWith('/auth/');   // enlaces de correo y cierre forzado: se atienden con o sin sesión

  if (!user && !PUBLICAS.has(ruta) && !libre) {
    const volver = rutaSegura(ruta + request.nextUrl.search, '');
    return redirigir(volver && volver !== '/' && volver !== '/panel' ? `/login?next=${encodeURIComponent(volver)}` : '/login');
  }
  if (user && PUBLICAS.has(ruta)) return redirigir('/panel');
  return marcar(respuesta);
}

export const config = {
  // Se excluyen la ruta de IA (usa su propio Bearer token), los archivos de Next y los recursos estáticos.
  matcher: ['/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt)$).*)'],
};
