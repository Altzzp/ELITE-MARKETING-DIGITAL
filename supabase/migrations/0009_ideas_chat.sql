-- 0009 · Ideas y Chat de IA
-- Funciones para crear y gestionar ideas, y para abrir conversaciones con la IA y guardar sus propuestas como ideas.
-- Todas verifican el rol y el acceso a la marca dentro de la base de datos (la última palabra la tiene siempre la base).

alter table ideas add constraint ideas_descripcion_corta check (char_length(descripcion) <= 2000);

-- ───────── Ideas ─────────
create function crear_idea(p_marca uuid, p_titulo text, p_formato formato_pieza, p_descripcion text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_titulo text := btrim(coalesce(p_titulo, '')); v_desc text := btrim(coalesce(p_descripcion, '')); v_id uuid;
begin
  if not es_interno() then raise exception 'Tu rol no puede crear ideas' using errcode = '42501'; end if;
  if not puede_ver_marca(p_marca) then raise exception 'No encontramos esa marca' using errcode = 'P0002'; end if;
  if not marca_activa(p_marca) then raise exception 'La marca está archivada: restáurala para crear ideas'; end if;
  if char_length(v_titulo) not between 1 and 200 then raise exception 'El título es obligatorio (hasta 200 caracteres)'; end if;
  if char_length(v_desc) > 2000 then raise exception 'La descripción es demasiado larga (hasta 2000 caracteres)'; end if;
  if p_formato is null then raise exception 'Elige un formato'; end if;
  insert into ideas (marca_id, titulo, descripcion, formato, origen) values (p_marca, v_titulo, v_desc, p_formato, 'manual') returning id into v_id;
  return v_id;
end $$;

-- Cambia una idea entre borrador y aprobada. «En producción» solo la fija convertir_idea_en_tarea.
create function cambiar_estado_idea(p_idea uuid, p_estado estado_idea) returns void
language plpgsql security definer set search_path = public as $$
declare i ideas;
begin
  if not es_rol('administrador', 'direccion', 'community_manager') then raise exception 'Tu rol no puede cambiar el estado de las ideas' using errcode = '42501'; end if;
  select * into i from ideas where id = p_idea for update;
  if not found or not puede_ver_marca(i.marca_id) then raise exception 'No encontramos esa idea' using errcode = 'P0002'; end if;
  if p_estado not in ('borrador', 'aprobada') then raise exception 'Estado no válido'; end if;
  if i.estado = 'en_produccion' then raise exception 'Esta idea ya es una tarea'; end if;
  if not marca_activa(i.marca_id) then raise exception 'La marca está archivada: restáurala para cambiar sus ideas'; end if;
  update ideas set estado = p_estado where id = i.id;
end $$;

-- Descarta (borra) una idea que aún no se convirtió en tarea. Administración, Dirección y CM; el resto, solo las suyas.
create function descartar_idea(p_idea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare i ideas;
begin
  if not es_interno() then raise exception 'Tu rol no puede descartar ideas' using errcode = '42501'; end if;
  select * into i from ideas where id = p_idea for update;
  if not found or not puede_ver_marca(i.marca_id) then raise exception 'No encontramos esa idea' using errcode = 'P0002'; end if;
  if not es_rol('administrador', 'direccion', 'community_manager') and i.creada_por is distinct from auth.uid() then
    raise exception 'Solo puedes descartar tus propias ideas' using errcode = '42501';
  end if;
  if i.estado = 'en_produccion' or exists (select 1 from tareas where idea_id = i.id) then raise exception 'Esta idea ya es una tarea'; end if;
  if not marca_activa(i.marca_id) then raise exception 'La marca está archivada: restáurala para cambiar sus ideas'; end if;
  delete from ideas where id = i.id;
end $$;

-- Idea → tarea (reemplaza la de 0003): ahora valida la fecha y rechaza marcas archivadas.
create or replace function convertir_idea_en_tarea(p_idea uuid, p_fecha date, p_responsable uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare i ideas; v_resp uuid; v_id uuid;
begin
  select * into i from ideas where id = p_idea for update;
  if not found or not es_interno() or not puede_ver_marca(i.marca_id) then raise exception 'No encontramos esa idea' using errcode = 'P0002'; end if;
  if not marca_activa(i.marca_id) then raise exception 'La marca está archivada: restáurala para crear piezas'; end if;
  if exists (select 1 from tareas where idea_id = i.id) or i.estado = 'en_produccion' then raise exception 'Esta idea ya es una tarea'; end if;
  perform _validar_pieza(i.titulo, i.formato, p_fecha);
  if es_rol('disenador') then v_resp := auth.uid();
  elsif p_responsable is not null then
    if not _es_disenador_de(p_responsable, i.marca_id) then raise exception 'Esa persona no es un diseñador activo de esta marca'; end if;
    v_resp := p_responsable;
  else v_resp := _disenador_libre(i.marca_id);
  end if;
  insert into tareas (marca_id, proyecto_id, idea_id, titulo, formato, fecha_programada, responsable_id)
  values (i.marca_id, i.proyecto_id, i.id, i.titulo, i.formato, p_fecha, v_resp) returning id into v_id;
  update ideas set estado = 'en_produccion' where id = i.id;
  return v_id;
end $$;

-- ───────── Chat de IA ─────────
-- Abre una conversación propia sobre una marca. Solo Administración, Dirección y Community Manager (los roles con el chat).
create function crear_conversacion(p_marca uuid, p_proveedor proveedor_ia default 'claude', p_modo modo_ia default 'ideas', p_titulo text default 'Conversación nueva') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_titulo text := btrim(coalesce(p_titulo, '')); v_id uuid;
begin
  if not es_rol('administrador', 'direccion', 'community_manager') then raise exception 'Tu rol no puede usar el chat de IA' using errcode = '42501'; end if;
  if not puede_ver_marca(p_marca) then raise exception 'No encontramos esa marca' using errcode = 'P0002'; end if;
  if not marca_activa(p_marca) then raise exception 'La marca está archivada: restáurala para usar el chat'; end if;
  if v_titulo = '' then v_titulo := 'Conversación nueva'; end if;
  insert into conversaciones_ia (marca_id, usuario_id, titulo, proveedor, modo) values (p_marca, auth.uid(), left(v_titulo, 120), p_proveedor, p_modo) returning id into v_id;
  return v_id;
end $$;

-- Guarda una propuesta de la IA (elemento n de un mensaje del asistente) como idea de la marca de la conversación.
create function guardar_idea_de_mensaje(p_mensaje uuid, p_indice int) returns uuid
language plpgsql security definer set search_path = public as $$
declare m mensajes_ia; c conversaciones_ia; e jsonb; v_titulo text; v_desc text; v_formato formato_pieza; v_id uuid;
begin
  if not es_rol('administrador', 'direccion', 'community_manager') then raise exception 'Tu rol no puede usar el chat de IA' using errcode = '42501'; end if;
  select * into m from mensajes_ia where id = p_mensaje and rol = 'asistente';
  if found then select * into c from conversaciones_ia where id = m.conversacion_id and usuario_id = auth.uid(); end if;
  if m.id is null or c.id is null or not puede_ver_marca(c.marca_id) then raise exception 'No encontramos ese mensaje' using errcode = 'P0002'; end if;
  if not marca_activa(c.marca_id) then raise exception 'La marca está archivada: restáurala para guardar ideas'; end if;
  if jsonb_typeof(m.elementos) <> 'array' or p_indice is null or p_indice < 0 or p_indice >= jsonb_array_length(m.elementos) then raise exception 'No encontramos esa propuesta' using errcode = 'P0002'; end if;
  e := m.elementos -> p_indice;
  v_titulo := left(btrim(coalesce(e ->> 'titulo', '')), 200);
  v_desc := left(btrim(coalesce(e ->> 'cuerpo', '')), 2000);
  if v_titulo = '' then raise exception 'La propuesta no tiene título'; end if;
  begin v_formato := (e ->> 'formato')::formato_pieza; exception when others then v_formato := 'post'; end;
  insert into ideas (marca_id, titulo, descripcion, formato, origen) values (c.marca_id, v_titulo, v_desc, coalesce(v_formato, 'post'), 'ia') returning id into v_id;
  return v_id;
end $$;

-- ───────── Apariencia ─────────
-- La persona cambia solo su propio tema (la tabla perfiles no se toca de otra forma desde la aplicación).
create function cambiar_tema(p_tema tema_ui) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_tema is null then raise exception 'Datos no válidos' using errcode = '42501'; end if;
  update perfiles set tema = p_tema where id = auth.uid();
end $$;

-- ───────── Permisos ─────────
revoke execute on function crear_idea(uuid, text, formato_pieza, text), cambiar_estado_idea(uuid, estado_idea), descartar_idea(uuid),
  convertir_idea_en_tarea(uuid, date, uuid), crear_conversacion(uuid, proveedor_ia, modo_ia, text), guardar_idea_de_mensaje(uuid, int), cambiar_tema(tema_ui) from public, anon, authenticated;
grant execute on function crear_idea(uuid, text, formato_pieza, text), cambiar_estado_idea(uuid, estado_idea), descartar_idea(uuid),
  convertir_idea_en_tarea(uuid, date, uuid), crear_conversacion(uuid, proveedor_ia, modo_ia, text), guardar_idea_de_mensaje(uuid, int), cambiar_tema(tema_ui) to authenticated;
