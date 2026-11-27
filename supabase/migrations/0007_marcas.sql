-- Élite Digital Marketing · 0007 · Información de marcas
-- La pantalla de marcas necesita: crear una marca (con su cliente, nuevo o existente, en un solo paso), editar la ficha,
-- archivar y restaurar (en la base real no se borra el historial), eliminar solo una marca vacía y decidir quién la ve.
-- Las funciones validan todo otra vez en la base de datos: la pantalla solo ayuda a corregir errores sin perder lo escrito.
-- Esquema de las fichas: paleta [{"nombre","hex"}] (4 colores), tipografias {"display","body"}, redes [{"red","usuario"}] (máx. 5, sin repetir).

-- ───────── Nombres únicos por agencia (sin distinguir mayúsculas) ─────────
create unique index marcas_nombre_unico on marcas (agencia_id, lower(nombre));
create unique index clientes_nombre_unico on clientes (agencia_id, lower(nombre));

-- ───────── Validación de la ficha (interna: la usan las funciones de abajo) ─────────
create function _ficha_marca_valida(p_nombre text, p_sector text, p_paleta jsonb, p_tipografias jsonb, p_redes jsonb,
                                    p_corto text default null, p_publico text default null, p_tono text default null, p_brief text default null)
returns void language plpgsql stable set search_path = public as $$
declare x jsonb; v_vistas text[] := '{}';
begin
  if not coalesce(length(btrim(p_nombre)) between 1 and 60, false) then raise exception 'Escribe el nombre de la marca (hasta 60 caracteres)'; end if;
  if length(coalesce(p_corto, '')) > 24 then raise exception 'El nombre corto admite hasta 24 caracteres'; end if;
  if not coalesce(length(btrim(p_sector)) between 1 and 60, false) then raise exception 'Indica el sector o rubro (hasta 60 caracteres)'; end if;
  if length(coalesce(p_publico, '')) > 400 then raise exception 'El público objetivo admite hasta 400 caracteres'; end if;
  if length(coalesce(p_tono, '')) > 160 then raise exception 'El tono admite hasta 160 caracteres'; end if;
  if length(coalesce(p_brief, '')) > 3000 then raise exception 'El brief admite hasta 3000 caracteres'; end if;

  if not coalesce(jsonb_typeof(p_paleta) = 'array' and jsonb_array_length(p_paleta) = 4, false) then raise exception 'La paleta debe tener exactamente 4 colores'; end if;
  for x in select * from jsonb_array_elements(p_paleta) loop
    if not coalesce(jsonb_typeof(x) = 'object' and jsonb_typeof(x->'hex') = 'string' and (x->>'hex') ~ '^#[0-9A-Fa-f]{6}$'
                    and jsonb_typeof(x->'nombre') = 'string' and length(x->>'nombre') <= 30, false) then
      raise exception 'Cada color de la paleta necesita un nombre (hasta 30 caracteres) y un código como #1F2A44'; end if;
  end loop;

  if not coalesce(jsonb_typeof(p_tipografias) = 'object' and jsonb_typeof(p_tipografias->'display') = 'string' and jsonb_typeof(p_tipografias->'body') = 'string'
                  and length(btrim(p_tipografias->>'display')) between 1 and 40 and length(btrim(p_tipografias->>'body')) between 1 and 40, false) then
    raise exception 'Las tipografías de títulos y de textos son obligatorias (hasta 40 caracteres cada una)'; end if;

  if not coalesce(jsonb_typeof(p_redes) = 'array' and jsonb_array_length(p_redes) <= 5, false) then raise exception 'Se admiten hasta 5 redes sociales'; end if;
  for x in select * from jsonb_array_elements(p_redes) loop
    if not coalesce(jsonb_typeof(x) = 'object' and (x->>'red') in ('Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Pinterest')
                    and jsonb_typeof(x->'usuario') = 'string' and length(btrim(x->>'usuario')) between 1 and 80, false) then
      raise exception 'Cada red necesita su nombre (Instagram, TikTok, Facebook, LinkedIn o Pinterest) y un usuario de hasta 80 caracteres'; end if;
    if (x->>'red') = any(v_vistas) then raise exception 'Hay una red repetida'; end if;
    v_vistas := v_vistas || (x->>'red');
  end loop;
end $$;

-- ───────── Crear una marca (y su cliente, si es nuevo) en un solo paso ─────────
create function crear_marca(p_nombre text, p_sector text, p_paleta jsonb, p_tipografias jsonb, p_redes jsonb,
                            p_cliente uuid default null, p_cliente_nuevo text default null, p_cliente_contacto text default null,
                            p_corto text default null, p_publico text default null, p_tono text default null, p_brief text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_ag uuid := agencia_actual(); v_cli uuid; v_id uuid;
begin
  if not es_rol('administrador', 'direccion') then raise exception 'Solo Administración o Dirección pueden crear marcas' using errcode = '42501'; end if;
  perform _ficha_marca_valida(p_nombre, p_sector, p_paleta, p_tipografias, p_redes, p_corto, p_publico, p_tono, p_brief);
  if p_cliente is not null and p_cliente_nuevo is not null then raise exception 'Elige un cliente de la lista o escribe uno nuevo, no ambos'; end if;
  if exists (select 1 from marcas where agencia_id = v_ag and lower(nombre) = lower(btrim(p_nombre))) then raise exception 'Ya existe una marca con ese nombre (puede estar archivada)'; end if;
  if p_cliente is null then
    if not coalesce(length(btrim(p_cliente_nuevo)) between 1 and 60, false) then raise exception 'Escribe el nombre del cliente (hasta 60 caracteres)'; end if;
    if length(coalesce(p_cliente_contacto, '')) > 60 then raise exception 'El contacto del cliente admite hasta 60 caracteres'; end if;
    if exists (select 1 from clientes where agencia_id = v_ag and lower(nombre) = lower(btrim(p_cliente_nuevo))) then raise exception 'Ya existe un cliente con ese nombre; elígelo de la lista'; end if;
    insert into clientes (agencia_id, nombre, contacto) values (v_ag, btrim(p_cliente_nuevo), nullif(btrim(coalesce(p_cliente_contacto, '')), '')) returning id into v_cli;
  else
    select id into v_cli from clientes where id = p_cliente and agencia_id = v_ag;
    if v_cli is null then raise exception 'No encontramos a ese cliente'; end if;
  end if;
  insert into marcas (agencia_id, cliente_id, nombre, nombre_corto, sector, publico_objetivo, tono, paleta, tipografias, redes, brief)
  values (v_ag, v_cli, btrim(p_nombre), nullif(btrim(coalesce(p_corto, '')), ''), btrim(p_sector), nullif(btrim(coalesce(p_publico, '')), ''), nullif(btrim(coalesce(p_tono, '')), ''),
          p_paleta, p_tipografias, p_redes, nullif(btrim(coalesce(p_brief, '')), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ───────── Editar la ficha (el cliente de una marca no se cambia desde aquí) ─────────
create function actualizar_marca(p_marca uuid, p_nombre text, p_sector text, p_paleta jsonb, p_tipografias jsonb, p_redes jsonb,
                                 p_corto text default null, p_publico text default null, p_tono text default null, p_brief text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ag uuid := agencia_actual();
begin
  if not es_rol('administrador', 'direccion', 'community_manager') then raise exception 'Solo Administración, Dirección o Community Manager pueden editar fichas' using errcode = '42501'; end if;
  if not exists (select 1 from marcas where id = p_marca and agencia_id = v_ag and puede_ver_marca(id)) then raise exception 'No encontramos esa marca'; end if;   -- también si no la tienes asignada
  perform _ficha_marca_valida(p_nombre, p_sector, p_paleta, p_tipografias, p_redes, p_corto, p_publico, p_tono, p_brief);
  if exists (select 1 from marcas where agencia_id = v_ag and lower(nombre) = lower(btrim(p_nombre)) and id <> p_marca) then raise exception 'Ya existe una marca con ese nombre (puede estar archivada)'; end if;
  update marcas set nombre = btrim(p_nombre), nombre_corto = nullif(btrim(coalesce(p_corto, '')), ''), sector = btrim(p_sector),
    publico_objetivo = nullif(btrim(coalesce(p_publico, '')), ''), tono = nullif(btrim(coalesce(p_tono, '')), ''),
    paleta = p_paleta, tipografias = p_tipografias, redes = p_redes, brief = nullif(btrim(coalesce(p_brief, '')), '')
  where id = p_marca;
end $$;

-- ───────── Archivar y restaurar: la marca deja de aparecer en el trabajo diario pero conserva su historial y sus reportes ─────────
create function archivar_marca(p_marca uuid, p_archivada boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_rol('administrador', 'direccion') then raise exception 'Solo Administración o Dirección pueden archivar marcas' using errcode = '42501'; end if;
  update marcas set activa = not coalesce(p_archivada, true) where id = p_marca and agencia_id = agencia_actual();
  if not found then raise exception 'No encontramos esa marca'; end if;
end $$;

-- ───────── Eliminar: solo una marca vacía y solo el Administrador (por ejemplo, una creada por error) ─────────
create function eliminar_marca(p_marca uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_rol('administrador') then raise exception 'Solo el administrador puede eliminar marcas' using errcode = '42501'; end if;
  if not exists (select 1 from marcas where id = p_marca and agencia_id = agencia_actual()) then raise exception 'No encontramos esa marca'; end if;
  if exists (select 1 from tareas where marca_id = p_marca) or exists (select 1 from ideas where marca_id = p_marca) or exists (select 1 from proyectos where marca_id = p_marca)
     or exists (select 1 from conversaciones_ia where marca_id = p_marca) or exists (select 1 from marca_archivos where marca_id = p_marca) then
    raise exception 'La marca tiene contenido (piezas, ideas, proyectos, conversaciones o archivos); archívala en lugar de eliminarla'; end if;
  delete from marcas where id = p_marca;
end $$;

-- ───────── Quién ve la marca (Administrador y Dirección ven todas, no se asignan) ─────────
create function asignar_marca(p_marca uuid, p_usuarios uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare v_ag uuid := agencia_actual(); v_ids uuid[] := coalesce(p_usuarios, '{}');
begin
  if not es_rol('administrador') then raise exception 'Solo el administrador puede dar acceso a las marcas' using errcode = '42501'; end if;
  if not exists (select 1 from marcas where id = p_marca and agencia_id = v_ag) then raise exception 'No encontramos esa marca'; end if;
  if exists (select 1 from unnest(v_ids) u where not exists (select 1 from perfiles where id = u and agencia_id = v_ag)) then raise exception 'Hay una persona que no pertenece a tu agencia'; end if;
  delete from usuario_marcas where marca_id = p_marca;
  insert into usuario_marcas (usuario_id, marca_id) select distinct p.id, p_marca from perfiles p where p.id = any(v_ids) and p.agencia_id = v_ag and p.rol not in ('administrador', 'direccion');
end $$;

-- ───────── El Panel no cuenta las marcas archivadas ─────────
create function marca_activa(p_marca uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from marcas where id = p_marca and agencia_id = agencia_actual() and activa)
$$;

create or replace function tareas_por_estado(p_marca uuid default null) returns table (estado estado_tarea, total int)
language sql stable set search_path = public as $$
  select e.estado, count(t.id)::int
  from unnest(enum_range(null::estado_tarea)) as e(estado)
  left join tareas t on t.estado = e.estado and (p_marca is null or t.marca_id = p_marca) and marca_activa(t.marca_id)
  group by e.estado
  order by e.estado
$$;

create or replace function versiones_recientes(p_marca uuid default null, p_limite int default 6)
returns table (tarea_id uuid, numero int, titulo text, marca_id uuid, formato formato_pieza, autor text, creado_en timestamptz)
language sql stable set search_path = public as $$
  select v.tarea_id, v.numero, t.titulo, t.marca_id, t.formato, p.nombre, v.creado_en
  from versiones v
  join tareas t on t.id = v.tarea_id
  left join perfiles p on p.id = v.creado_por
  where (p_marca is null or t.marca_id = p_marca) and marca_activa(t.marca_id)
  order by v.creado_en desc, v.numero desc
  limit least(greatest(coalesce(p_limite, 6), 1), 50)
$$;

-- ───────── Superficie de la API (mismo criterio que 0003, 0005 y 0006) ─────────
revoke execute on function
  _ficha_marca_valida(text, text, jsonb, jsonb, jsonb, text, text, text, text),
  crear_marca(text, text, jsonb, jsonb, jsonb, uuid, text, text, text, text, text, text),
  actualizar_marca(uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text),
  archivar_marca(uuid, boolean), eliminar_marca(uuid), asignar_marca(uuid, uuid[]), marca_activa(uuid)
  from public, anon, authenticated;
grant execute on function
  crear_marca(text, text, jsonb, jsonb, jsonb, uuid, text, text, text, text, text, text),
  actualizar_marca(uuid, text, text, jsonb, jsonb, jsonb, text, text, text, text),
  archivar_marca(uuid, boolean), eliminar_marca(uuid), asignar_marca(uuid, uuid[]), marca_activa(uuid)
  to authenticated;
