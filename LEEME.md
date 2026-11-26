# Élite Digital Marketing · Arquitectura para la versión real

La demostración visual (12 pantallas, datos ficticios) vive en `../index.html`. Esta carpeta es el paso siguiente: base de datos, seguridad, servicios de IA y la aplicación real (`servidor/`). **Inicio de sesión y las 11 secciones de trabajo ya funcionan contra la base de datos** (algunas en versión básica, ver la tabla); solo «Apps y plantillas» sigue pendiente.

## Estado real

| Pieza | Estado | Cómo se verificó |
|---|---|---|
| Esquema, RLS y flujo (idea → tarea → aprobación → publicación → reportes) | Hecho: `supabase/migrations/0001–0009` | `npm run probar:sql`: 85 pruebas contra PostgreSQL real (PGlite) que imita lo mínimo de Supabase; incluye el script del primer administrador |
| Capa de IA del servidor (Claude, ChatGPT, Gemini) | Hecho como código: `servidor/ia/` + ruta `servidor/app/api/ia/route.ts` | `npm run probar:ia`: 25 pruebas con servicios **simulados**; `npm run tipos`: TypeScript estricto sin errores. La ruta acepta la sesión por cookie (pantallas) o un Bearer token, y rechaza envíos de otros sitios |
| Inicio de sesión (Next.js + Supabase Auth): ingreso, cierre, registro solo por invitación, recuperación de contraseña, roles y módulos por rol, sesión en cookies HttpOnly, CSP con nonce | Hecho: `servidor/app`, `servidor/acciones`, `servidor/lib`, `servidor/proxy.ts` | `npm run probar:acceso` (12 pruebas de reglas) y `npm run probar:e2e` (**22 pruebas de acceso en Chromium real** contra la aplicación compilada y un **Supabase simulado** con PostgreSQL real y las migraciones reales). Además se rompieron a propósito 9 protecciones (redirección abierta, cookie sin HttpOnly, cuenta suspendida, módulos por rol, otras sesiones tras cambiar la contraseña, enlace gastado al abrirlo, cierre forzado, CSP, origen de la ruta de IA) y las pruebas fallaron como debían |
| **Usuarios y roles** (pantalla real): ver a las personas, invitar (sin tocar SQL), revocar invitaciones pendientes, cambiar rol, suspender y reactivar, asignar marcas y editar qué secciones ve cada rol | Hecho: `servidor/app/(app)/usuarios`, `servidor/acciones/usuarios.ts`, `servidor/lib/usuarios.ts`, migración `0005` | `npm run probar:usuarios` (8 reglas), 6 pruebas SQL nuevas y **12 pruebas en Chromium real** (invitar y que la persona cree su cuenta con lo asignado, revocar, rol, suspender, marcas, permisos, solo-lectura para quien no es Administrador, un envío copiado con otra sesión, enlaces manipulados, móvil, sin JavaScript). Se rompieron a propósito 13 puntos y las pruebas detectaron 12; el que sobrevivió (quitar el control de Administrador en la acción) lo sigue bloqueando la base de datos |
| **Panel** (pantalla real): 4 indicadores (totales, realizadas, contenido subido, vencidas), rendimiento por marca, actividades por estado, listas de pendientes / realizadas / contenido subido y selector de marca | Hecho: `servidor/app/(app)/panel`, `servidor/lib/panel.ts` (reglas), `servidor/lib/panel-datos.ts` (lectura), migración `0006`. Cada rol ve lo suyo por las reglas de la base (Diseñador: solo sus piezas; Community Manager y Cliente: sus marcas). Las fechas se miden en la zona horaria de la agencia | `npm run probar:panel` (11 reglas), 4 pruebas SQL nuevas y **6 pruebas en Chromium real** con datos de ejemplo por rol (cifras, listas, filtro por marca, marca ajena forzada en la URL, sin datos, base caída, móvil). Se rompió el código a propósito 19 veces y las pruebas detectaron las 19 |
| **Información de marcas** (pantalla real): lista de marcas con su paleta, ficha con pestañas (General, Identidad visual, Comunicación, Redes, Brief y, solo para el Administrador, Acceso), crear (con cliente existente o nuevo), editar la ficha, archivar y restaurar, eliminar una marca vacía y elegir quién ve cada marca | Hecho: `servidor/app/(app)/marcas` (lista y ficha, `nueva`, `[id]/editar`), `servidor/acciones/marcas.ts`, `servidor/lib/marcas.ts` (reglas), `servidor/lib/marcas-datos.ts` (lectura), `servidor/componentes/FormularioMarca.tsx`, migración `0007`. El Panel ya no cuenta las marcas archivadas | `npm run probar:marcas` (20 reglas), 13 pruebas SQL nuevas (incluida una que comprueba que los límites de la pantalla son idénticos a los de la base) y **12 pruebas en Chromium real** (crear con cliente nuevo y existente, errores que conservan lo escrito, validación aunque se salten el formulario, editar, permisos de Community Manager y Diseñador, archivar y su efecto en el Panel, eliminar, acceso, un envío copiado con otra sesión, sin JavaScript, colores guardados raros, enlaces manipulados, móvil). Se rompió el código a propósito 23 veces y las pruebas detectaron 22; la que sobrevivió es equivalente (la base ya oculta las marcas ajenas, así que el cambio no tenía efecto visible) |
| **Tablero** (pantalla real): cuatro columnas (En diseño, En revisión, Aprobado, Publicado) con filtros por texto, marca y responsable; crear y editar piezas; en cada pieza: versiones, comentarios, enviar a revisión, aprobar o pedir cambios, devolver a diseño y confirmar la publicación (canal y enlace http/https validados). El Panel ya muestra cifras reales | Hecho: migración `0008_tablero.sql`, `lib/tablero.ts`, `lib/tablero-datos.ts`, `acciones/tablero.ts`, `/tablero`, `/tablero/nueva`, `/tablero/[id]`, `/tablero/[id]/editar` | `npm run probar:tablero` (12), pruebas de la base (18 nuevas) y 6 de punta a punta con navegador real. Pendiente del Tablero: arrastrar tarjetas, adjuntar archivos a las versiones (necesita Storage) y proyectos |
| **Aprobaciones** (pantalla real): el cliente ve solo las piezas de sus marcas que esperan su decisión (con la última versión y su nota), aprueba o pide cambios (la explicación es obligatoria) y consulta las decisiones recientes. Administración y Dirección también deciden; el Community Manager solo mira. Las marcas archivadas no aparecen | Hecho: `lib/aprobaciones.ts`, `lib/aprobaciones-datos.ts`, `acciones/aprobaciones.ts`, `/aprobaciones` (reutiliza `decidir_aprobacion` de 0003: sin migración nueva) | 3 pruebas de punta a punta con navegador real (cliente, roles y móvil). Pendiente: enlaces de aprobación para clientes sin cuenta (la tabla ya existe) |
| **Ideas** (versión básica): banco de ideas por marca; crear, aprobar o devolver a borrador, descartar y **pasar al Tablero** con fecha (crea la pieza y deja la idea «en producción»). El cliente no la ve; el diseñador crea y descarta solo las suyas | Hecho: migración `0009_ideas_chat.sql` (`crear_idea`, `cambiar_estado_idea`, `descartar_idea`, `convertir_idea_en_tarea` mejorada), `lib/ideas.ts`, `lib/ideas-datos.ts`, `acciones/ideas.ts`, `/ideas` | Pruebas de la base (3), reglas (`npm run probar:secciones`) y 1 prueba de punta a punta con navegador real. Pendiente: editar una idea ya creada y proyectos |
| **Calendario** (versión básica, solo lectura): vista de mes con las piezas en su fecha de publicación, color por estado, filtro por marca, enlace a la pieza para quien tiene Tablero; en el móvil se convierte en lista de los días con piezas | Hecho: `lib/calendario.ts`, `/calendario` | Reglas (mes, semanas lunes-domingo) y 1 prueba con navegador real (escritorio y móvil). Pendiente: mover fechas arrastrando (hoy se cambian al editar la pieza) |
| **Reportes** (versión básica): por marca, piezas, publicadas, pendientes, atrasadas, % a tiempo, espera media de aprobación y versiones por pieza; publicaciones por canal; periodos de 30/90/365 días o todo; se conservan las marcas archivadas; botón para imprimir o guardar como PDF desde el navegador | Hecho: `lib/reportes.ts`, `/reportes` (usa `metricas()` de 0003: cada rol ve lo que la base le deja ver) | Reglas (intervalos, periodos) y 1 prueba con navegador real que cuadra las cifras con la base. Pendiente: historial en `reportes_generados` y envío automático de los lunes |
| **Chat de IA** (versión básica): conversaciones propias por marca, elegir modelo y qué necesitas, enviar a la ruta `/api/ia`, ver las propuestas y **guardarlas en Ideas**. Sin clave de ningún proveedor lo avisa y no deja escribir | Hecho: `lib/chat.ts`, `acciones/chat.ts`, `componentes/EnviarMensaje.tsx`, `/chat`, funciones `crear_conversacion` y `guardar_idea_de_mensaje` (0009) | Pruebas de la base (conversación privada, propuesta → idea), 1 prueba con navegador real (sin proveedor, abrir, ver respuesta guardada, guardar como idea, privacidad, roles sin acceso). **El envío real de un mensaje a un modelo no se probó** (sin claves): cuando conectes una, haz una prueba. Pendiente: borrar conversaciones |
| **Apariencia** y **Vista por rol** | Hecho: `/apariencia` (cada persona guarda su tema claro/oscuro/automático con `cambiar_tema`), `/vista` (matriz de permisos por rol, solo lectura) | 2 pruebas con navegador real |
| Apps y plantillas | **Pendiente**: la sección muestra un aviso de que aún no está disponible | — |
| Página pública de aprobación por enlace seguro | **Pendiente** (la función SQL `decidir_por_enlace` ya existe) | — |
| Reporte en PDF | En la **demo** ya se genera en el navegador (`../src/60-pdf.js`, jsPDF). En la app real falta guardar un historial en `reportes_generados` y el envío automático de los lunes (automatización a6, requiere servidor) | `test/persistencia.py` (50 comprobaciones en navegador real: contenido, tildes, varias hojas, cancelar, sin conexión) |
| Logotipo oficial y wireframe | **No recibidos**: la demo usa una "É" provisional | — |

## Qué NO está probado

- **Ninguna llamada real a Anthropic, OpenAI o Gemini.** Las peticiones siguen la documentación pública de cada una, pero se probaron solo contra respuestas simuladas. Al conectar claves reales, confirma en especial el encabezado `x-goog-api-key` de Gemini y que el modelo que elijas acepte `max_completion_tokens` (OpenAI) y `responseMimeType` (Gemini).
- **Supabase real.** El inicio de sesión se probó contra un **simulador** (`pruebas/supabase-simulado.mjs`) que imita Auth (GoTrue) y las consultas REST con los códigos de error documentados, y que usa la base PostgreSQL real con tus migraciones (triggers de invitación y RLS incluidos). Un simulador solo sabe lo que se le enseñó: **no prueba** la entrega real de correos, la plantilla de los enlaces, la lista de URLs permitidas, los límites de Supabase ni sus mensajes de error exactos. Al conectar tu proyecto, recorre una vez cada flujo (ingresar, invitar, confirmar correo, recuperar) con una cuenta de prueba. `pg_cron` y Realtime solo se activan en un proyecto Supabase.
- **Solo Chromium.** Las pruebas en navegador corren en Chromium; no se probó en Safari ni Firefox.
- **La ruta de IA** funciona dentro de Next y se probó con la sesión por cookie, pero no se hizo una llamada real a ningún proveedor.

## Puesta en marcha

0. Si todavía no tienes las cuentas, sigue [`GUIA_CUENTAS.md`](GUIA_CUENTAS.md) (Supabase, IA, correo, hosting; sin pegar claves en el chat).
1. Crea un proyecto en Supabase y aplica las migraciones **en orden** (`supabase db push` o pegando cada archivo en el editor SQL). Después ejecuta **una vez** `supabase/semilla_primer_administrador.sql` con tu correo y crea tu usuario con ese correo: sin ese paso nadie puede entrar, porque el registro es solo por invitación y solo un Administrador invita.
2. Ajusta Supabase para el inicio de sesión (URLs, dos plantillas de correo, SMTP propio): **Paso 1b de la guía**. Sin las plantillas, los enlaces de confirmación y recuperación no funcionan.
3. Copia `servidor/.env.example` a `.env.local` y completa `APP_URL`, `SUPABASE_URL` y `SUPABASE_ANON_KEY` (clave **publishable/anon**; el servidor rechaza una clave de servicio). Un proveedor de IA queda activo solo con clave **y** modelo; sin ellos la ruta responde `503 proveedor_no_configurado` (nunca inventa una respuesta). En producción `APP_URL` debe empezar con `https://`.
4. `npm install`, luego `npm run dev` (desarrollo) o `npm run build` y `npm run start` (producción), y entra con tu correo de Administrador. Al resto del equipo lo invitas desde **Usuarios y roles → Invitar persona** (correo, rol y marcas). Esa pantalla **registra** la invitación pero **todavía no envía ningún correo**: avísale a la persona, que debe crear su cuenta en `/registro` con ese mismo correo (la pantalla te muestra la dirección). Hasta que lo haga, la invitación queda en "Invitaciones pendientes" y puedes revocarla.
5. Cómo probar todo: `npm run probar:todo` (tipos, reglas, SQL, IA y navegador). Las pruebas en navegador necesitan Playwright y Chromium (`npx playwright install chromium`).

### Cómo funciona el acceso (para quien mantenga el código)

- **Sesión:** cookies `HttpOnly`, `SameSite=Lax` y `Secure` (en producción), de 14 días con renovación al usarse. El navegador nunca ve el token. La aplicación no usa la clave de servicio.
- **Tres capas:** `proxy.ts` (renueva la sesión, aplica la CSP y manda a `/login`), cada página y acción vuelve a verificar con `getUser()` (`lib/sesion.ts`), y la base de datos aplica RLS. Si una capa falla, las otras siguen protegiendo.
- **Registro:** Supabase debe tener los registros abiertos; la base de datos (trigger) rechaza cualquier correo sin invitación. Ni el ingreso ni el registro revelan si un correo ya tiene cuenta (mismo mensaje). Sí avisan cuando no hay invitación, para que la persona la pida al administrador.
- **Enlaces de correo:** llevan a `/auth/confirmar`, que pide pulsar un botón antes de gastar el enlace de un solo uso (los antivirus de correo abren los enlaces por su cuenta).
- **Cuenta suspendida:** se detecta en cada visita aunque la cookie siga siendo válida; la sesión se cierra y se avisa.

### Cómo funciona Usuarios y roles

- **Quién:** la sección la ve el rol que tenga ese permiso; solo el **Administrador** puede cambiar algo. Cualquier otro rol al que se le dé la sección la ve en solo lectura (sin invitaciones pendientes).
- **Dos candados:** cada acción (`acciones/usuarios.ts`) exige sesión, módulo y rol Administrador y llama a una función de la base de datos con la sesión de la persona (`invitar_usuario`, `actualizar_usuario`, `revocar_invitacion`, `cambiar_permiso`); esas funciones vuelven a exigir Administrador y la base valida las marcas. Next comprueba además el origen de cada envío.
- **Anti-bloqueo (migración 0005):** nadie puede cambiar su propio rol ni suspenderse; el Administrador no puede perder **Panel** ni **Usuarios y roles**; **Apariencia** no se puede quitar a ningún rol (ni con SQL directo: lo impide un disparador).
- **Efecto de los cambios:** rol, suspensión y permisos se aplican en la **siguiente visita** de la persona, no en la página que ya tiene abierta.
- **Marcas:** Administrador y Dirección ven todas; para el resto se asignan una por una. La URL solo lleva códigos de aviso de una lista fija (nunca texto libre).
- **Pendiente a propósito:** CAPTCHA (no activarlo en Supabase hasta agregarlo), autenticación en dos pasos, y cerrar todas las sesiones desde un panel.

### Cómo funciona el Tablero
- Quién puede qué: crear y mover piezas, todo el equipo (el diseñador solo para sí); editar y publicar, Administración, Dirección y Community Manager; aprobar o pedir cambios, Administración, Dirección y Cliente. La base de datos lo exige igual que la pantalla.
- Sin elegir responsable, la pieza queda a cargo del diseñador de la marca con menos piezas abiertas.
- Solo se sube una versión nueva con la pieza en diseño; una pieza publicada ya no se edita (sí admite comentarios).
- La migración 0008 cerró dos huecos: la URL de publicación se aceptaba sin validar (un `javascript:` habría acabado como enlace) y las piezas de una marca archivada se podían seguir moviendo.

### Cómo funcionan Ideas y Chat de IA
- Las ideas son internas: el cliente no las ve. Crear una idea, todo el equipo; aprobarla o devolverla a borrador, Administración, Dirección y Community Manager; descartar, los mismos y cada persona sus propias ideas. Una idea que ya pasó al Tablero queda «en producción» y no se descarta.
- El chat es solo para Administración, Dirección y Community Manager. Cada conversación es **privada de quien la abre** (ni siquiera el Administrador la ve). Las respuestas de la IA no se publican solas: cada propuesta se guarda como idea con un clic y de ahí sigue el flujo normal.
- Si el modelo elegido no tiene clave en el servidor, el chat lo dice y no se puede escribir; ver `GUIA_CUENTAS.md`, paso 2.

### Cómo funciona Información de marcas

- **Quién hace qué** (la base de datos lo exige igual que la pantalla): **Administrador** crea, edita, archiva, elimina y da acceso; **Dirección** crea, edita y archiva (ve todas las marcas); **Community Manager** solo edita la ficha de las marcas que tiene asignadas; **Diseñador** y el resto, si se les da la sección, solo la ven. La pestaña **Acceso** (quién ve cada marca) es solo del Administrador.
- **Crear:** nombre, sector y cliente son obligatorios; el cliente se elige de la lista o se escribe uno nuevo y se crea **junto con la marca en un solo paso** (si algo falla no queda un cliente suelto). La paleta son 4 colores `#RRGGBB`, hay hasta 5 redes (una por red) y los límites de cada campo son los mismos en la pantalla y en la base.
- **Archivar en lugar de borrar:** una marca archivada deja de aparecer en el Panel y en las listas del equipo, pero **conserva sus piezas, reportes e historial** y se puede restaurar. Solo Administración y Dirección ven las archivadas. **Eliminar** solo funciona con una marca vacía (sin piezas, ideas, proyectos, conversaciones ni archivos), pide una casilla de confirmación y no borra al cliente.
- **Nombres únicos** (sin distinguir mayúsculas) para marcas y clientes de una misma agencia; el cliente de una marca no se cambia desde la ficha.
- **Aviso de contraste:** si el color principal y el fondo claro casi no se distinguen (menos de 3:1) la pestaña Identidad lo advierte; es solo un aviso.
- **Pendiente a propósito:** la pestaña **Archivos** de la marca (logotipos, manuales, referencias) llegará con el almacenamiento de archivos; el demo la mostraba con datos de ejemplo y aquí no se inventa nada.

### Llamar a la ruta de IA desde las pantallas

Con la sesión por cookie no hace falta manejar tokens; la ruta exige que el envío venga de la propia aplicación:

```ts
const r = await fetch('/api/ia', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },   // obligatorio: la ruta rechaza otros tipos
  body: JSON.stringify({ conversacion_id, texto, modo, proveedor }),   // proveedor es opcional
});
```

Otros clientes (scripts, pruebas) pueden usar `authorization: Bearer <access token de Supabase>`.

`GET /api/ia` devuelve `{ proveedores: { claude, chatgpt, gemini } }` con `true/false`: úsalo para que el chip de la pantalla 04 diga "conectado" solo cuando lo esté.

## Reglas de seguridad que ya están aplicadas

- Las claves de IA solo existen en variables del servidor. Los errores que ve la persona son mensajes genéricos; el detalle del proveedor queda en el registro del servidor, enmascarado.
- La ruta usa el token de la persona: RLS decide qué conversaciones y marcas ve. Los clientes no tienen acceso a la IA y las conversaciones son privadas (ni Dirección las lee).
- **La IA solo propone.** Nunca crea tareas ni publica. Una persona convierte una propuesta con `convertir_idea_en_tarea(...)`.
- Los datos de la marca viajan al modelo como datos, no como instrucciones. La salida del modelo se valida y recorta; **la interfaz debe mostrarla siempre como texto, nunca como HTML**.
- Límite de gasto por persona (`IA_LIMITE_TOKENS_24H`) sobre la tabla `uso_ia`. Peticiones simultáneas pueden pasarse del límite por, como máximo, una respuesta cada una.

## Fallo corregido en la migración 0004

La versión anterior medía el uso de IA sumando `mensajes_ia`, pero cualquiera podía **borrar su conversación** (los mensajes se borran en cascada) o insertar tokens negativos y reiniciar su consumo. Una prueba lo reproduce y otra confirma la corrección: el consumo va a `uso_ia`, que solo admite altas con valores no negativos.

## Marcas: el demo y la aplicación real no se comportan igual al eliminar

En el demo, "Eliminar marca" borra la marca y todo lo suyo (piezas, ideas, publicaciones, proyectos, conversaciones). En la aplicación real **no se puede eliminar una marca con contenido** (la base lo impide con `on delete restrict` y con una comprobación en `eliminar_marca`); la salida prevista y ya implementada es **archivar**, que conserva el historial y los reportes. Eliminar de verdad queda para una marca vacía y solo para el Administrador.

## Siguiente paso sugerido

**Publicar la aplicación** (necesita tus cuentas de Supabase y Vercel: `GUIA_CUENTAS.md`) y recorrer una vez cada flujo con cuentas de prueba, porque todo se probó contra un Supabase simulado. Después, por orden de valor: enlaces de aprobación para clientes sin cuenta, envío de correos de invitación, subir archivos a las versiones y a la ficha de marca (Storage), historial y envío automático de reportes en PDF, y «Apps y plantillas». Si llegan `logo.png` y `WIREFRAME.pdf`, se incorporan antes de dar por cerrado el diseño.
