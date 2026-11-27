-- Élite Digital Marketing · 0001 · Esquema (PostgreSQL 15+ / Supabase)
-- Agencia → clientes → marcas → proyectos → ideas → tareas → aprobaciones → publicaciones → reportes.
-- "Pieza" y "tarea" son un mismo registro (tareas) con sus versiones, igual que en la demostración.
-- Los permisos y las reglas de flujo están en 0002 y 0003; aquí solo estructura e invariantes.

create type rol_usuario     as enum ('administrador','direccion','community_manager','disenador','cliente');
create type estado_usuario  as enum ('activo','suspendido');
create type tema_ui         as enum ('claro','oscuro','sistema');
create type modulo_app      as enum ('panel','calendario','ideas','chat','plantillas','tablero','marcas','aprobaciones','reportes','usuarios','vista','apariencia');
create type formato_pieza   as enum ('post','reel','historia','carrusel','banner');
create type estado_idea     as enum ('borrador','aprobada','en_produccion');
create type estado_tarea    as enum ('en_diseno','en_revision','aprobado','publicado');
create type estado_aprob    as enum ('ninguna','pendiente','cambios','aprobada');
create type resultado_ronda as enum ('aprobada','cambios');
create type proveedor_ia    as enum ('claude','chatgpt','gemini');
create type modo_ia         as enum ('ideas','copies','guiones','campanas','calendario','analizar_marca','tarea_desde_idea');

-- ───────── Agencia, personas y permisos ─────────
create table agencias (
  id           uuid primary key default gen_random_uuid(),
  nombre       text not null,
  zona_horaria text not null default 'America/Lima',   -- define "hoy" para vencimientos y cumplimiento
  creada_en    timestamptz not null default now()
);

create table perfiles (          -- 1:1 con auth.users; se crea solo por invitación (ver 0003)
  id         uuid primary key references auth.users(id) on delete cascade,
  agencia_id uuid not null references agencias(id) on delete cascade,
  nombre     text not null,
  email      text not null,
  rol        rol_usuario not null,
  estado     estado_usuario not null default 'activo',
  tema       tema_ui not null default 'sistema',   -- modo oscuro: preferencia por usuario
  creado_en  timestamptz not null default now()
);
create unique index perfiles_email_uq on perfiles (lower(email));
create index perfiles_agencia_idx on perfiles (agencia_id);

create table invitaciones (
  id          uuid primary key default gen_random_uuid(),
  agencia_id  uuid not null references agencias(id) on delete cascade,
  email       text not null,
  rol         rol_usuario not null,
  marca_ids   uuid[] not null default '{}',
  invitado_por uuid references perfiles(id) on delete set null,
  creada_en   timestamptz not null default now(),
  aceptada_en timestamptz
);
create unique index invitaciones_pendiente_uq on invitaciones (lower(email)) where aceptada_en is null;

create table permisos_rol (      -- qué módulos ve cada rol (editable por el administrador)
  agencia_id uuid not null references agencias(id) on delete cascade,
  rol        rol_usuario not null,
  modulo     modulo_app not null,
  primary key (agencia_id, rol, modulo)
);

-- ───────── Clientes, marcas y proyectos ─────────
create table clientes (
  id         uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id) on delete cascade,
  nombre     text not null,
  contacto   text,
  creado_en  timestamptz not null default now(),
  unique (id, agencia_id)
);

create table marcas (
  id               uuid primary key default gen_random_uuid(),
  agencia_id       uuid not null references agencias(id) on delete cascade,
  cliente_id       uuid not null,
  nombre           text not null,
  nombre_corto     text,
  sector           text,
  publico_objetivo text,
  tono             text,
  paleta           jsonb not null default '[]',   -- [{"nombre":"Cobre","hex":"#C8793A"}]
  tipografias      jsonb not null default '{}',   -- {"display":"Fraunces","body":"Inter"}
  redes            jsonb not null default '[]',   -- [{"red":"Instagram","usuario":"@marca"}]
  brief            text,
  logo_ruta        text,                          -- ruta en Storage, logotipo original sin alterar
  activa           boolean not null default true,
  creada_en        timestamptz not null default now(),
  foreign key (cliente_id, agencia_id) references clientes (id, agencia_id),
  unique (id, agencia_id)
);
create index marcas_agencia_idx on marcas (agencia_id);

create table usuario_marcas (    -- marcas autorizadas para cada persona (Administrador y Dirección ven todas)
  usuario_id uuid not null references perfiles(id) on delete cascade,
  marca_id   uuid not null references marcas(id) on delete cascade,
  primary key (usuario_id, marca_id)
);
create index usuario_marcas_marca_idx on usuario_marcas (marca_id);

create table marca_archivos (
  id          uuid primary key default gen_random_uuid(),
  marca_id    uuid not null references marcas(id) on delete cascade,
  nombre      text not null,
  ruta_storage text not null,
  bytes       bigint,
  subido_por  uuid default auth.uid() references perfiles(id) on delete set null,
  subido_en   timestamptz not null default now()
);

create table proyectos (
  id        uuid primary key default gen_random_uuid(),
  marca_id  uuid not null references marcas(id) on delete cascade,
  nombre    text not null,
  creado_en timestamptz not null default now(),
  unique (id, marca_id)
);

-- ───────── Ideas y tareas ─────────
create table ideas (
  id          uuid primary key default gen_random_uuid(),
  marca_id    uuid not null references marcas(id) on delete cascade,
  proyecto_id uuid,
  titulo      text not null check (char_length(titulo) between 1 and 200),
  descripcion text not null default '',
  formato     formato_pieza not null,
  estado      estado_idea not null default 'borrador',
  origen      text not null default 'manual' check (origen in ('manual','ia')),
  creada_por  uuid default auth.uid() references perfiles(id) on delete set null,
  creada_en   timestamptz not null default now(),
  foreign key (proyecto_id, marca_id) references proyectos (id, marca_id),
  unique (id, marca_id)
);
create index ideas_marca_idx on ideas (marca_id);

create table tareas (
  id               uuid primary key default gen_random_uuid(),
  marca_id         uuid not null references marcas(id) on delete restrict,
  proyecto_id      uuid,
  idea_id          uuid,
  titulo           text not null check (char_length(titulo) between 1 and 200),
  formato          formato_pieza not null,
  fecha_programada date not null,                      -- el calendario se alimenta de esta columna
  responsable_id   uuid references perfiles(id) on delete set null,
  estado           estado_tarea not null default 'en_diseno',
  aprobacion       estado_aprob not null default 'ninguna',
  publicada_en     timestamptz,
  creada_por       uuid default auth.uid() references perfiles(id) on delete set null,
  creada_en        timestamptz not null default now(),
  foreign key (proyecto_id, marca_id) references proyectos (id, marca_id),
  foreign key (idea_id, marca_id) references ideas (id, marca_id),
  -- el tablero y la aprobación nunca pueden contradecirse
  constraint estado_coherente check (
    (estado = 'en_diseno'   and aprobacion in ('ninguna','cambios')) or
    (estado = 'en_revision' and aprobacion = 'pendiente') or
    (estado in ('aprobado','publicado') and aprobacion = 'aprobada')),
  constraint publicada_coherente check ((estado = 'publicado') = (publicada_en is not null))
);
create index tareas_marca_fecha_idx on tareas (marca_id, fecha_programada);
create index tareas_responsable_idx on tareas (responsable_id);
create unique index tareas_idea_uq on tareas (idea_id) where idea_id is not null;   -- una idea, una tarea

create table versiones (         -- historial de versiones de la pieza
  id          uuid primary key default gen_random_uuid(),
  tarea_id    uuid not null references tareas(id) on delete cascade,
  numero      int  not null,
  nota        text not null default '',
  archivo_ruta text,                                   -- Storage: {agencia}/{marca}/{tarea}/{numero}-nombre
  creado_por  uuid references perfiles(id) on delete set null,
  creado_en   timestamptz not null default now(),
  unique (tarea_id, numero)
);

create table comentarios (
  id        uuid primary key default gen_random_uuid(),
  tarea_id  uuid not null references tareas(id) on delete cascade,
  autor_id  uuid default auth.uid() references perfiles(id) on delete set null,   -- null = decisión por enlace seguro
  texto     text not null check (char_length(texto) between 1 and 4000),
  tipo      text not null default 'nota' check (tipo in ('nota','cambio')),
  via_enlace boolean not null default false,
  creado_en timestamptz not null default now()
);
create index comentarios_tarea_idx on comentarios (tarea_id, creado_en);

-- ───────── Aprobaciones y publicaciones ─────────
create table rondas_aprobacion (  -- una fila por envío a revisión; da el tiempo promedio de aprobación
  id            uuid primary key default gen_random_uuid(),
  tarea_id      uuid not null references tareas(id) on delete cascade,
  solicitada_en timestamptz not null default now(),
  decidida_en   timestamptz,
  resultado     resultado_ronda,
  decidida_por  uuid references perfiles(id) on delete set null,
  check ((decidida_en is null) = (resultado is null))
);
create index rondas_tarea_idx on rondas_aprobacion (tarea_id);
create unique index rondas_abierta_uq on rondas_aprobacion (tarea_id) where decidida_en is null;

create table enlaces_aprobacion ( -- enlaces seguros para clientes sin cuenta; solo se guarda el hash del token
  id          uuid primary key default gen_random_uuid(),
  tarea_id    uuid not null references tareas(id) on delete cascade,
  token_hash  text not null unique,
  expira_en   timestamptz not null,
  revocado_en timestamptz,
  usado_en    timestamptz,
  creado_por  uuid default auth.uid() references perfiles(id) on delete set null,
  creado_en   timestamptz not null default now()
);

create table publicaciones (      -- una publicación confirmada alimenta los reportes
  id            uuid primary key default gen_random_uuid(),
  tarea_id      uuid not null unique references tareas(id) on delete restrict,
  marca_id      uuid not null references marcas(id) on delete restrict,
  canal         text not null check (char_length(canal) between 1 and 40),
  url           text,
  publicada_en  timestamptz not null default now(),
  confirmada_por uuid references perfiles(id) on delete set null
);
create index publicaciones_marca_idx on publicaciones (marca_id, publicada_en);

-- ───────── Notificaciones, auditoría y automatizaciones ─────────
create table notificaciones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references perfiles(id) on delete cascade,
  texto          text not null,
  marca_id       uuid references marcas(id) on delete cascade,
  modulo_destino modulo_app,
  tarea_id       uuid references tareas(id) on delete cascade,
  clave_unica    text,                                  -- evita repetir un mismo aviso
  creada_en      timestamptz not null default now(),
  leida_en       timestamptz,
  unique (usuario_id, clave_unica)
);
create index notificaciones_sin_leer_idx on notificaciones (usuario_id, creada_en desc) where leida_en is null;

create table auditoria (          -- registro de modificaciones: solo se escribe desde triggers
  id         bigint generated always as identity primary key,
  agencia_id uuid,
  marca_id   uuid,
  usuario_id uuid,
  tabla      text not null,
  registro_id uuid,
  accion     text not null check (accion in ('INSERT','UPDATE','DELETE')),
  cambios    jsonb not null,    -- INSERT: fila nueva · UPDATE: {columna:[antes,después]} · DELETE: fila borrada
  creada_en  timestamptz not null default now()
);
create index auditoria_agencia_idx on auditoria (agencia_id, creada_en desc);

create table automatizaciones (
  agencia_id  uuid not null references agencias(id) on delete cascade,
  clave       text not null,
  nombre      text not null,
  descripcion text not null,
  activa      boolean not null default true,
  modificable boolean not null default true,
  primary key (agencia_id, clave)
);

create table reportes_generados ( -- reservado para el reporte PDF (aún sin generador, ver LEEME)
  id         uuid primary key default gen_random_uuid(),
  agencia_id uuid not null references agencias(id) on delete cascade,
  marca_id   uuid references marcas(id) on delete cascade,
  desde      date not null,
  hasta      date not null,
  archivo_ruta text not null,
  creado_en  timestamptz not null default now()
);

-- ───────── Inteligencia artificial ─────────
create table conversaciones_ia (
  id            uuid primary key default gen_random_uuid(),
  marca_id      uuid not null references marcas(id) on delete cascade,
  usuario_id    uuid not null default auth.uid() references perfiles(id) on delete cascade,
  titulo        text not null default 'Conversación nueva',
  proveedor     proveedor_ia not null default 'claude',
  modo          modo_ia not null default 'ideas',
  creada_en     timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create index conversaciones_usuario_idx on conversaciones_ia (usuario_id, actualizada_en desc);

create table mensajes_ia (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_ia(id) on delete cascade,
  rol             text not null check (rol in ('usuario','asistente')),
  modo            modo_ia,
  texto           text not null,
  elementos       jsonb not null default '[]',          -- [{"titulo","cuerpo","formato"}] → "Guardar en banco de ideas"
  proveedor       proveedor_ia,
  modelo          text,
  tokens_entrada  int,
  tokens_salida   int,
  creado_en       timestamptz not null default now()
);
create index mensajes_conv_idx on mensajes_ia (conversacion_id, creado_en);

create table referencias_ia (     -- enlaces de Pinterest y Behance guardados en la conversación
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones_ia(id) on delete cascade,
  red             text not null check (red in ('pinterest','behance')),
  titulo          text not null,
  url             text not null check (url ~ '^https://'),
  creada_en       timestamptz not null default now()
);
