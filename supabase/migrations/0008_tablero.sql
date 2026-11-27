-- 0008 · Tablero de seguimiento: crear y editar piezas, subir versiones y comentar.
-- Requiere 0001–0007. Qué añade:
--   · crear_tarea / actualizar_tarea: alta y edición con validación, responsable automático (el diseñador de la marca con menos piezas abiertas) y
--     comprobación de rol. El estado y la aprobación NO se escriben aquí: solo cambian con las funciones del flujo (0003).
--   · agregar_version / agregar_comentario: reglas claras en un solo sitio (longitudes, rol, estado de la pieza).
--   · Endurecimientos de lo anterior:
--       1) confirmar_publicacion validaba poco el enlace: un texto como "javascript:…" habría acabado como enlace en el tablero y los reportes.
--          Ahora solo admite http(s), sin espacios, hasta 500 caracteres (y un CHECK en la tabla lo repite).
--       2) Ninguna función del flujo se detenía ante una marca archivada: ahora _cargar_tarea la rechaza y un disparador impide crear piezas en ella.
-- Quién puede qué: crear (todo el equipo; el diseñador solo para sí), editar (Administrador, Dirección, Community Manager), versiones (equipo),
-- comentarios (cualquiera que vea la pieza, incluido el Cliente). La visibilidad la sigue decidiendo RLS (0002).

-- ───────── 1) El flujo no toca marcas archivadas ─────────
create or replace function _cargar_tarea(p_tarea uuid, variadic p_roles rol_usuario[]) returns tareas
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  if not found or not puede_ver_marca(t.marca_id) or (rol_actual() = 'disenador' and t.responsable_id is distinct from auth.uid()) then
    raise exception 'No encontramos esa tarea' using errcode = 'P0002';
  end if;
  if not es_rol(variadic p_roles) then raise exception 'Tu rol no puede hacer esto' using errcode = '42501'; end if;
  if not marca_activa(t.marca_id) then raise exception 'La marca está archivada: restáurala para seguir trabajando en sus piezas'; end if;
  return t;
end $$;

create function _tarea_en_marca_activa() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Sin depender de la sesión (marca_activa sí depende): también protege a quien inserte con la base directamente, p. ej. una importación.
  if exists (select 1 from marcas where id = new.marca_id and not activa) then raise exception 'La marca está archivada: restáurala para crear piezas'; end if;
  return new;
end $$;
create trigger tareas_marca_activa before insert on tareas for each row execute function _tarea_en_marca_activa();

-- ───────── 2) Publicación: canal y enlace validados ─────────
alter table publicaciones add constraint publicaciones_url_http check (url is null or url ~* '^https?://[^[:space:]<>"]+$') not valid;

create or replace function confirmar_publicacion(p_tarea uuid, p_canal text, p_url text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas; v_canal text := btrim(coalesce(p_canal, '')); v_url text := nullif(btrim(coalesce(p_url, '')), '');
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager');
  if t.estado <> 'aprobado' then raise exception 'La pieza debe estar aprobada antes de publicarse'; end if;
  if v_canal = '' then raise exception 'Indica el canal de publicación'; end if;
  if char_length(v_canal) > 40 then raise exception 'El canal admite hasta 40 caracteres'; end if;
  if v_url is not null and (char_length(v_url) > 500 or v_url !~* '^https?://[^[:space:]<>"]+$') then
    raise exception 'El enlace debe empezar por http:// o https://, sin espacios (hasta 500 caracteres)';
  end if;
  update tareas set estado = 'publicado', publicada_en = now() where id = t.id;
  insert into publicaciones (tarea_id, marca_id, canal, url, confirmada_por) values (t.id, t.marca_id, v_canal, v_url, auth.uid());
  perform _notificar(_destinatarios(t.marca_id, array['community_manager','cliente']::rol_usuario[], array[t.responsable_id]),
    format('“%s” se publicó en %s', t.titulo, v_canal), t.marca_id, 'reportes', t.id);
end $$;

-- ───────── 3) Piezas: crear y editar ─────────
-- Validación común (internas: no se otorgan a nadie).
create function _validar_pieza(p_titulo text, p_formato formato_pieza, p_fecha date) returns void
language plpgsql immutable set search_path = public as $$
begin
  if p_titulo is null or char_length(p_titulo) not between 1 and 200 then raise exception 'Escribe el título de la tarea (hasta 200 caracteres)'; end if;
  if p_formato is null then raise exception 'Elige el formato de la pieza'; end if;
  if p_fecha is null then raise exception 'Indica la fecha de publicación'; end if;
  if p_fecha < date '2020-01-01' or p_fecha > current_date + 1095 then raise exception 'Revisa el año de la fecha de publicación'; end if;
end $$;

create function _es_disenador_de(p_usuario uuid, p_marca uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from perfiles u join usuario_marcas um on um.usuario_id = u.id
    where u.id = p_usuario and um.marca_id = p_marca and u.rol = 'disenador' and u.estado = 'activo' and u.agencia_id = agencia_actual())
$$;

-- El diseñador activo de la marca con menos piezas abiertas (desempata por nombre); null si la marca no tiene diseñadores.
create function _disenador_libre(p_marca uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select u.id from perfiles u join usuario_marcas um on um.usuario_id = u.id
  where um.marca_id = p_marca and u.rol = 'disenador' and u.estado = 'activo' and u.agencia_id = agencia_actual()
  order by (select count(*) from tareas t where t.responsable_id = u.id and t.estado <> 'publicado'), u.nombre limit 1
$$;

create function crear_tarea(p_marca uuid, p_titulo text, p_formato formato_pieza, p_fecha date, p_responsable uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_titulo text := btrim(coalesce(p_titulo, '')); v_resp uuid; v_id uuid;
begin
  if not es_interno() then raise exception 'Tu rol no puede crear tareas' using errcode = '42501'; end if;
  if not puede_ver_marca(p_marca) then raise exception 'No encontramos esa marca' using errcode = 'P0002'; end if;
  if not marca_activa(p_marca) then raise exception 'La marca está archivada: restáurala para crear piezas'; end if;
  perform _validar_pieza(v_titulo, p_formato, p_fecha);
  if es_rol('disenador') then v_resp := auth.uid();                      -- un diseñador solo crea piezas para sí
  elsif p_responsable is not null then
    if not _es_disenador_de(p_responsable, p_marca) then raise exception 'Esa persona no es un diseñador activo de esta marca'; end if;
    v_resp := p_responsable;
  else v_resp := _disenador_libre(p_marca);
  end if;
  insert into tareas (marca_id, titulo, formato, fecha_programada, responsable_id) values (p_marca, v_titulo, p_formato, p_fecha, v_resp) returning id into v_id;
  return v_id;
end $$;

-- Edita los datos de la pieza. Con p_responsable null la pieza queda sin responsable. Una pieza publicada ya no se edita.
create function actualizar_tarea(p_tarea uuid, p_titulo text, p_formato formato_pieza, p_fecha date, p_responsable uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas; v_titulo text := btrim(coalesce(p_titulo, ''));
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager');
  if t.estado = 'publicado' then raise exception 'Una pieza publicada ya no se edita'; end if;
  perform _validar_pieza(v_titulo, p_formato, p_fecha);
  if p_responsable is not null and p_responsable is distinct from t.responsable_id and not _es_disenador_de(p_responsable, t.marca_id) then
    raise exception 'Esa persona no es un diseñador activo de esta marca';
  end if;
  update tareas set titulo = v_titulo, formato = p_formato, fecha_programada = p_fecha, responsable_id = p_responsable where id = t.id;
end $$;

-- ───────── 4) Versiones y comentarios ─────────
-- Solo se sube una versión nueva con la pieza en diseño: así la versión que el cliente está revisando (o ya aprobó) no cambia por debajo.
-- La regla vive en el disparador (no solo en la función) para que tampoco se salte con una inserción directa desde la API; cuando no hay
-- una persona con sesión (p. ej. una importación o una corrección hecha por quien administra la base) no se aplica.
alter table versiones add constraint versiones_nota_corta check (char_length(nota) <= 500);

create or replace function asignar_version() returns trigger language plpgsql security definer set search_path = public as $$
declare v_estado estado_tarea;
begin
  select estado into v_estado from tareas where id = new.tarea_id for update;
  if v_estado = 'publicado' then raise exception 'Una pieza publicada ya no admite versiones'; end if;
  if v_estado <> 'en_diseno' and auth.uid() is not null then
    raise exception 'Devuelve la pieza a diseño antes de subir una versión nueva: así la versión que se revisa o se aprobó no cambia';
  end if;
  select coalesce(max(numero), 0) + 1 into new.numero from versiones where tarea_id = new.tarea_id;
  new.creado_por := auth.uid();
  return new;
end $$;

create function agregar_version(p_tarea uuid, p_nota text default '') returns int
language plpgsql security definer set search_path = public as $$
declare t tareas; v_nota text := btrim(coalesce(p_nota, '')); v_num int;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager','disenador');
  if t.estado = 'publicado' then raise exception 'Una pieza publicada ya no admite versiones'; end if;
  if t.estado <> 'en_diseno' then raise exception 'Devuelve la pieza a diseño antes de subir una versión nueva: así la versión que se revisa o se aprobó no cambia'; end if;
  if char_length(v_nota) > 500 then raise exception 'La nota de la versión admite hasta 500 caracteres'; end if;
  insert into versiones (tarea_id, nota) values (t.id, v_nota) returning numero into v_num;
  return v_num;
end $$;

create function agregar_comentario(p_tarea uuid, p_texto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare t tareas; v_txt text := btrim(coalesce(p_texto, '')); v_id uuid;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager','disenador','cliente');
  if char_length(v_txt) not between 1 and 4000 then raise exception 'Escribe el comentario (hasta 4000 caracteres)'; end if;
  insert into comentarios (tarea_id, autor_id, texto) values (t.id, auth.uid(), v_txt) returning id into v_id;
  return v_id;
end $$;

-- ───────── Permisos ─────────
revoke execute on function crear_tarea(uuid, text, formato_pieza, date, uuid), actualizar_tarea(uuid, text, formato_pieza, date, uuid),
  agregar_version(uuid, text), agregar_comentario(uuid, text), confirmar_publicacion(uuid, text, text) from public, anon, authenticated;
grant execute on function crear_tarea(uuid, text, formato_pieza, date, uuid), actualizar_tarea(uuid, text, formato_pieza, date, uuid),
  agregar_version(uuid, text), agregar_comentario(uuid, text), confirmar_publicacion(uuid, text, text) to authenticated;
revoke execute on function _validar_pieza(text, formato_pieza, date), _es_disenador_de(uuid, uuid), _disenador_libre(uuid), _tarea_en_marca_activa() from public, anon, authenticated;
