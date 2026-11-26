# Guía: crear las cuentas que necesita la versión real

Para quien administra la agencia; no hace falta saber programar. Mientras no existan estas cuentas, la plataforma solo se puede ver como demostración y en las pruebas locales: para que tu equipo y tus clientes la usen, hace falta publicarla con estas cuentas.

## Regla de oro

**Nunca pegues una clave en un chat, un correo, un documento compartido ni una captura de pantalla.** Si una se expone, se revoca en el panel de quien la emitió y se crea otra (es gratis y tarda un minuto). Las claves viven solo en dos sitios: el archivo `.env.local` del servidor y el panel de variables de entorno del hosting. Hay un modelo en `servidor/.env.example`.

## Qué cuentas hacen falta

| Cuenta | Para qué | ¿Hace falta ya? | Qué sale de ella |
|---|---|---|---|
| **Supabase** | Inicio de sesión, base de datos y archivos | Sí | URL del proyecto y clave pública |
| **Un proveedor de IA** (Claude, ChatGPT o Gemini) | El chat de IA (pantalla 04) | Basta con uno | Clave de API (secreta) |
| **Servicio de correo** (por ejemplo Resend) | Avisos y enlaces de aprobación para clientes | Solo cuando se construya el módulo de correos | Clave de API (secreta) |
| **Hosting para Next.js** (por ejemplo Vercel) | Publicar la aplicación en internet | Solo para publicar | Variables de entorno |

Los precios y límites cambian: míralos en la página de cada servicio antes de contratar. La IA se cobra **por uso**, así que pon un límite de gasto mensual desde el primer día.

## Paso 1: Supabase

1. Crea una cuenta en supabase.com y un proyecto nuevo (**New project**). Elige una región cercana a tu equipo y guarda la contraseña de la base de datos en un gestor de contraseñas.
2. Abre **SQL Editor** y ejecuta, **en orden y uno por uno**, los nueve archivos de `supabase/migrations/` (`0001` a `0009`). Si alguno da error, detente y cuéntame el mensaje de error (no cualquier clave).
3. Abre `supabase/semilla_primer_administrador.sql`, cambia el correo de la línea marcada por el tuyo y ejecútalo. Hace falta porque nadie puede registrarse sin invitación y solo un Administrador puede invitar: este script deja invitada a la primera persona. Se puede ejecutar una sola vez.
4. En **Authentication → Users** pulsa **Add user → Create new user**, con **ese mismo correo** y una contraseña de al menos 10 caracteres; marca **Auto Confirm User** si aparece. Al crearlo quedas como Administrador y, desde ahí, invitas al resto en **Usuarios y roles → Invitar persona** (la aplicación aún no envía correo de invitación: avisa tú a cada persona para que cree su cuenta en `/registro` con el correo invitado). (Alternativa: abrir `/registro` en la aplicación ya publicada con ese correo; requiere que el envío de correos del paso 1b esté listo.)
5. En **Settings → API Keys** copia la **URL del proyecto** y la clave **publishable** (en proyectos antiguos aparece como **anon**). Van en `SUPABASE_URL` y `SUPABASE_ANON_KEY`.

### Paso 1b: configurar el inicio de sesión en Supabase (5 ajustes, una sola vez)

La aplicación ya trae las pantallas de inicio de sesión, registro por invitación y recuperación de contraseña (`servidor/`). Para que los enlaces de los correos funcionen hay que ajustar Supabase. Los nombres de los menús pueden cambiar un poco; si no encuentras uno, busca el nombre en negrita.

1. **Authentication → URL Configuration.** En **Site URL** pon la dirección pública de la aplicación (la misma de `APP_URL`, por ejemplo `https://app.tu-dominio.com`). En **Redirect URLs** agrega `https://app.tu-dominio.com/auth/confirmar` (la dirección exacta es mejor que un comodín). Para probar en tu computador agrega también `http://localhost:3000/auth/confirmar`.
2. **Authentication → Emails → Templates.** Cambia dos plantillas para que el enlace pase por la aplicación en vez de por Supabase. Es necesario: los enlaces normales no funcionan con la sesión segura de la aplicación.
   - **Confirm signup**, enlace: `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email`
   - **Reset password**, enlace: `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=recovery`

   Conserva el resto del texto de cada plantilla (puedes escribirlo en español); solo cambia la dirección del botón o del enlace. Si dejas `{{ .ConfirmationURL }}`, la persona verá "Enlace no válido".
3. **Authentication → SMTP Settings (correo propio).** El correo que trae Supabase por defecto solo sirve para pruebas: según su documentación entrega únicamente a miembros de tu organización en Supabase y con un tope de unos 2 mensajes por hora, así que **los clientes y el equipo invitado no recibirían nada**. Configura un servicio de correo (por ejemplo Resend, ver Paso 3) y pon aquí sus datos SMTP.
4. **Longitud mínima de contraseña.** En los ajustes del proveedor **Email** (Authentication → Sign In / Providers) sube la longitud mínima a 10. La aplicación ya exige 10 antes de enviar, esto es un seguro adicional.
5. **No actives CAPTCHA todavía** (Authentication → Attack Protection). La aplicación aún no sabe enviar ese comprobante y, si se activa, **nadie podría iniciar sesión**. Supabase ya limita por su cuenta los intentos repetidos (Authentication → Rate Limits); la aplicación muestra "Demasiados intentos" cuando se alcanza el límite.

Dos cosas a no tocar:

- **No uses la clave `secret` / `service_role`.** La aplicación no la necesita y la ruta de IA la rechaza a propósito: se salta todas las reglas de seguridad.
- **No desactives los registros públicos de Supabase.** Las personas invitadas se registran solas; quien decide si pueden entrar es la base de datos, que rechaza cualquier correo sin invitación.

## Paso 2: proveedor de IA (basta con uno)

Una suscripción de chat (Claude, ChatGPT o Gemini en su app) **no incluye** acceso por API: la API se contrata aparte, en la consola para desarrolladores de cada empresa.

- **Claude:** cuenta en la consola para desarrolladores de Anthropic (el enlace está en docs.claude.com). Carga saldo o fija un límite de gasto y crea una clave. Va en `ANTHROPIC_API_KEY`; `ANTHROPIC_MODEL` ya viene configurado.
- **ChatGPT (OpenAI):** platform.openai.com → clave de API en `OPENAI_API_KEY`. El modelo vigente se copia de su documentación a `OPENAI_MODEL`.
- **Gemini (Google):** aistudio.google.com → clave de API en `GEMINI_API_KEY` y el modelo vigente en `GEMINI_MODEL`.

Un proveedor queda activo solo si tiene clave **y** modelo. `IA_LIMITE_TOKENS_24H` limita lo que puede gastar cada persona por día.

## Paso 3: correo (más adelante)

Con un servicio como Resend se crea la cuenta, se **verifica el dominio** de la agencia (el servicio te da unos registros DNS que se agregan donde compraste el dominio) y se crea una clave de API. No hace falta hasta que se construya el módulo de avisos y enlaces de aprobación.

## Paso 4: hosting

En Vercel (u otro hosting compatible con Next.js) se conecta el repositorio y las variables del `.env.example` se pegan en su panel de variables de entorno. Revisa si el plan gratuito permite uso comercial antes de publicar a clientes reales.

## Qué puedo y qué no puedo hacer desde aquí

Desde mi espacio de trabajo no entro a tus cuentas ni a tu proyecto de Supabase. Construyo y pruebo la aplicación aquí con una base PostgreSQL real en memoria, un Supabase simulado para el inicio de sesión (probado en un navegador real) y simulaciones de los proveedores de IA. La conexión final con tus cuentas la haces tú, o quien te ayude con la parte técnica, siguiendo esta guía. Cuando algo falle al conectar, cuéntame el **mensaje de error** (sin claves) y lo resolvemos.
