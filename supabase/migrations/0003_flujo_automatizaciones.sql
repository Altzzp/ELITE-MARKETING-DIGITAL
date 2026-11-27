-- Élite Digital Marketing · 0003 · Flujo, automatizaciones e indicadores
-- Idea → tarea → calendario → aprobación → tablero → publicación → reportes, aplicado en la base de datos.
-- La interfaz solo llama a estas funciones; no hay forma de saltarse las reglas desde el navegador.

-- ───────── Utilidades internas (no se exponen a la API) ─────────
create function _auto_activa(p_agencia uuid, p_clave text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select activa from automatizaciones where agencia_id = p_agencia and clave = p_clave), true)
$$;

-- Personas de la marca con alguno de los roles (más extras), sin incluir a quien ejecuta la acción.
create function _destinatarios(p_marca uuid, p_roles rol_usuario[], p_extra uuid[] default '{}') returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select u.id as x from perfiles u join marcas m on m.agencia_id = u.agencia_id
    where m.id = p_marca and u.estado = 'activo' and u.rol = any(p_roles)
      and (u.rol in ('administrador','direccion') or exists (select 1 from usuario_marcas um where um.usuario_id = u.id and um.marca_id = m.id))
    union
    select u.id from perfiles u join marcas m on m.agencia_id = u.agencia_id
    where m.id = p_marca and u.estado = 'activo' and u.id = any(p_extra)
  ) s where x is distinct from auth.uid()
$$;

create function _notificar(p_usuarios uuid[], p_texto text, p_marca uuid, p_modulo modulo_app, p_tarea uuid, p_clave text default null)
returns void language sql security definer set search_path = public as $$
  insert into notificaciones (usuario_id, texto, marca_id, modulo_destino, tarea_id, clave_unica)
  select u, p_texto, p_marca, p_modulo, p_tarea, p_clave from unnest(p_usuarios) u
  on conflict (usuario_id, clave_unica) do nothing
$$;

-- Carga y bloquea la tarea, y comprueba visibilidad y rol antes de cualquier transición.
create function _cargar_tarea(p_tarea uuid, variadic p_roles rol_usuario[]) returns tareas
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea for update;
  if not found or not puede_ver_marca(t.marca_id) or (rol_actual() = 'disenador' and t.responsable_id is distinct from auth.uid()) then
    raise exception 'No encontramos esa tarea' using errcode = 'P0002';
  end if;
  if not es_rol(variadic p_roles) then raise exception 'Tu rol no puede hacer esto' using errcode = '42501'; end if;
  return t;
end $$;

-- ───────── Alta de agencia: permisos por rol y automatizaciones iniciales ─────────
create function sembrar_agencia() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into permisos_rol (agencia_id, rol, modulo)
  select new.id, r.rol, m from (values
    ('administrador'::rol_usuario,   enum_range(null::modulo_app)),
    ('direccion'::rol_usuario,       array(select x from unnest(enum_range(null::modulo_app)) x where x <> 'usuarios')),
    ('community_manager'::rol_usuario, array['panel','calendario','ideas','chat','plantillas','tablero','marcas','aprobaciones','vista','apariencia']::modulo_app[]),
    ('disenador'::rol_usuario,       array['panel','calendario','ideas','plantillas','tablero','marcas','vista','apariencia']::modulo_app[]),
    ('cliente'::rol_usuario,         array['panel','calendario','aprobaciones','reportes','vista','apariencia']::modulo_app[])
  ) r(rol, mods), unnest(r.mods) m;
  insert into automatizaciones (agencia_id, clave, nombre, descripcion, activa, modificable) values
    (new.id,'recordatorio_vencimiento','Recordatorio de vencimiento','Avisa hasta 2 días antes de la fecha de una pieza que aún no se publica.',true,true),
    (new.id,'aviso_aprobacion','Aviso de aprobaciones','Notifica al cliente cuando una pieza espera su aprobación y al equipo cuando se aprueba.',true,true),
    (new.id,'aviso_cambios','Aviso de cambios solicitados','Notifica al equipo cuando el cliente pide cambios.',true,true),
    (new.id,'registro_modificaciones','Registro de modificaciones','Guarda quién cambió qué y cuándo.',true,false),
    (new.id,'actualizacion_indicadores','Actualización de indicadores','Los indicadores se calculan al consultarlos, por eso siempre están al día.',true,false),
    (new.id,'reporte_semanal','Reporte semanal en PDF','Genera y envía el reporte cada lunes. Requiere el generador de PDF, que aún no existe.',false,false);
  return new;
end $$;
create trigger agencias_sembrar after insert on agencias for each row execute function sembrar_agencia();

-- ───────── Registro de modificaciones ─────────
create function registrar_auditoria() returns trigger language plpgsql security definer set search_path = public as $$
declare v_fila jsonb; v_old jsonb; v_cambios jsonb; v_marca uuid; v_ag uuid;
begin
  v_fila := case tg_op when 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_old  := case tg_op when 'UPDATE' then to_jsonb(old) end;
  v_cambios := case tg_op when 'UPDATE'
    then (select coalesce(jsonb_object_agg(k, jsonb_build_array(v_old->k, v_fila->k)), '{}')
          from jsonb_object_keys(v_fila) k where v_old->k is distinct from v_fila->k)
    else v_fila end;
  if tg_op = 'UPDATE' and v_cambios = '{}' then return null; end if;
  v_marca := case when tg_table_name = 'marcas' then (v_fila->>'id')::uuid
    else coalesce((v_fila->>'marca_id')::uuid, (select t.marca_id from tareas t where t.id = (v_fila->>'tarea_id')::uuid)) end;
  v_ag := coalesce((v_fila->>'agencia_id')::uuid, (select m.agencia_id from marcas m where m.id = v_marca), agencia_actual());
  insert into auditoria (agencia_id, marca_id, usuario_id, tabla, registro_id, accion, cambios)
  values (v_ag, v_marca, auth.uid(), tg_table_name, (v_fila->>'id')::uuid, tg_op, v_cambios);
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['clientes','marcas','usuario_marcas','proyectos','ideas','tareas','versiones','comentarios',
    'rondas_aprobacion','publicaciones','perfiles','permisos_rol','automatizaciones']
  loop execute format('create trigger aud_%1$s after insert or update or delete on %1$I for each row execute function registrar_auditoria()', t); end loop;
end $$;

-- Numeración de versiones sin carreras: v1, v2, v3… por tarea.
create function asignar_version() returns trigger language plpgsql security definer set search_path = public as $$
declare v_estado estado_tarea;
begin
  select estado into v_estado from tareas where id = new.tarea_id for update;
  if v_estado = 'publicado' then raise exception 'Una pieza publicada ya no admite versiones'; end if;
  select coalesce(max(numero), 0) + 1 into new.numero from versiones where tarea_id = new.tarea_id;
  new.creado_por := auth.uid();
  return new;
end $$;
create trigger versiones_numerar before insert on versiones for each row execute function asignar_version();

-- ───────── Transiciones del flujo ─────────
create function enviar_a_aprobacion(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas; v_ag uuid;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager','disenador');
  if t.estado = 'publicado' then raise exception 'Una pieza publicada ya no se mueve'; end if;
  if t.aprobacion in ('pendiente','aprobada') then raise exception 'La pieza ya está en revisión o aprobada'; end if;
  if not exists (select 1 from versiones where tarea_id = t.id) then raise exception 'Sube al menos una versión antes de enviar a revisión'; end if;
  update tareas set estado = 'en_revision', aprobacion = 'pendiente' where id = t.id;
  insert into rondas_aprobacion (tarea_id) values (t.id);
  select agencia_id into v_ag from marcas where id = t.marca_id;
  if _auto_activa(v_ag, 'aviso_aprobacion') then
    perform _notificar(_destinatarios(t.marca_id, array['cliente']::rol_usuario[]),
      format('“%s” espera tu aprobación', t.titulo), t.marca_id, 'aprobaciones', t.id);
  end if;
end $$;

create function devolver_a_diseno(p_tarea uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager','disenador');
  if t.estado = 'publicado' then raise exception 'Una pieza publicada ya no se mueve'; end if;
  if t.estado = 'en_diseno' then return; end if;
  if t.aprobacion = 'pendiente' then
    update rondas_aprobacion set decidida_en = now(), resultado = 'cambios', decidida_por = auth.uid()
      where tarea_id = t.id and decidida_en is null;
  end if;
  -- Una pieza ya aprobada que vuelve a diseño necesita una ronda nueva: la aprobación se reinicia.
  update tareas set estado = 'en_diseno', aprobacion = case t.aprobacion when 'pendiente' then 'cambios' else 'ninguna' end::estado_aprob
    where id = t.id;
end $$;

create function _aplicar_decision(p_tarea uuid, p_resultado resultado_ronda, p_comentario text, p_actor uuid, p_via_enlace boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t tareas; v_ag uuid; v_txt text := nullif(btrim(coalesce(p_comentario, '')), '');
begin
  select * into t from tareas where id = p_tarea for update;
  if t.aprobacion <> 'pendiente' then raise exception 'Esta pieza no está esperando una decisión'; end if;
  if p_resultado = 'cambios' and v_txt is null then raise exception 'Explica qué cambios necesitas'; end if;
  update rondas_aprobacion set decidida_en = now(), resultado = p_resultado, decidida_por = p_actor
    where tarea_id = t.id and decidida_en is null;
  update tareas set
    estado     = case p_resultado when 'aprobada' then 'aprobado' else 'en_diseno' end::estado_tarea,
    aprobacion = case p_resultado when 'aprobada' then 'aprobada' else 'cambios' end::estado_aprob
    where id = t.id;
  if v_txt is not null then
    insert into comentarios (tarea_id, autor_id, texto, tipo, via_enlace)
    values (t.id, p_actor, v_txt, case when p_resultado = 'cambios' then 'cambio' else 'nota' end, p_via_enlace);
  end if;
  select agencia_id into v_ag from marcas where id = t.marca_id;
  if p_resultado = 'aprobada' and _auto_activa(v_ag, 'aviso_aprobacion') then
    perform _notificar(_destinatarios(t.marca_id, array['community_manager']::rol_usuario[], array[t.responsable_id]),
      format('“%s” fue aprobada', t.titulo), t.marca_id, 'tablero', t.id);
  elsif p_resultado = 'cambios' and _auto_activa(v_ag, 'aviso_cambios') then
    perform _notificar(_destinatarios(t.marca_id, array['community_manager']::rol_usuario[], array[t.responsable_id]),
      format('Se pidieron cambios en “%s”', t.titulo), t.marca_id, 'aprobaciones', t.id);
  end if;
end $$;

create function decidir_aprobacion(p_tarea uuid, p_resultado resultado_ronda, p_comentario text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','cliente');
  perform _aplicar_decision(t.id, p_resultado, p_comentario, auth.uid(), false);
end $$;

create function confirmar_publicacion(p_tarea uuid, p_canal text, p_url text default null) returns void
language plpgsql security definer set search_path = public as $$
declare t tareas;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager');
  if t.estado <> 'aprobado' then raise exception 'La pieza debe estar aprobada antes de publicarse'; end if;
  if coalesce(btrim(p_canal), '') = '' then raise exception 'Indica el canal de publicación'; end if;
  update tareas set estado = 'publicado', publicada_en = now() where id = t.id;
  insert into publicaciones (tarea_id, marca_id, canal, url, confirmada_por)
  values (t.id, t.marca_id, btrim(p_canal), nullif(btrim(coalesce(p_url, '')), ''), auth.uid());
  perform _notificar(_destinatarios(t.marca_id, array['community_manager','cliente']::rol_usuario[], array[t.responsable_id]),
    format('“%s” se publicó en %s', t.titulo, btrim(p_canal)), t.marca_id, 'reportes', t.id);
end $$;

-- Idea → tarea. Sin responsable, asigna al diseñador de la marca con menos tareas abiertas.
create function convertir_idea_en_tarea(p_idea uuid, p_fecha date, p_responsable uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare i ideas; v_resp uuid; v_id uuid;
begin
  select * into i from ideas where id = p_idea for update;
  if not found or not es_interno() or not puede_ver_marca(i.marca_id) then raise exception 'No encontramos esa idea' using errcode = 'P0002'; end if;
  if exists (select 1 from tareas where idea_id = i.id) then raise exception 'Esta idea ya es una tarea'; end if;
  v_resp := coalesce(p_responsable, (
    select u.id from perfiles u join usuario_marcas um on um.usuario_id = u.id
    where um.marca_id = i.marca_id and u.rol = 'disenador' and u.estado = 'activo'
    order by (select count(*) from tareas t where t.responsable_id = u.id and t.estado <> 'publicado'), u.nombre limit 1));
  if es_rol('disenador') then v_resp := auth.uid(); end if;
  insert into tareas (marca_id, proyecto_id, idea_id, titulo, formato, fecha_programada, responsable_id)
  values (i.marca_id, i.proyecto_id, i.id, i.titulo, i.formato, p_fecha, v_resp) returning id into v_id;
  update ideas set estado = 'en_produccion' where id = i.id;
  return v_id;
end $$;

-- ───────── Enlaces seguros de aprobación (la página pública que los usa aún no existe) ─────────
-- El token se genera y se hashea (SHA-256) en el servidor; aquí solo se guarda el hash.
create function crear_enlace_aprobacion(p_tarea uuid, p_token_hash text, p_horas int default 72) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare t tareas; v_exp timestamptz;
begin
  t := _cargar_tarea(p_tarea, 'administrador','direccion','community_manager');
  if t.aprobacion <> 'pendiente' then raise exception 'La pieza debe estar en revisión para compartir un enlace'; end if;
  if p_horas not between 1 and 336 or p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'Datos del enlace no válidos'; end if;
  insert into enlaces_aprobacion (tarea_id, token_hash, expira_en) values (t.id, p_token_hash, now() + make_interval(hours => p_horas))
  returning expira_en into v_exp;
  return v_exp;
end $$;

create function decidir_por_enlace(p_token_hash text, p_resultado resultado_ronda, p_comentario text default null) returns void
language plpgsql security definer set search_path = public as $$
declare e enlaces_aprobacion;
begin
  select * into e from enlaces_aprobacion where token_hash = p_token_hash for update;
  if not found or e.revocado_en is not null or e.usado_en is not null or e.expira_en < now() then
    raise exception 'El enlace no es válido o ya venció';
  end if;
  update enlaces_aprobacion set usado_en = now() where id = e.id;
  perform _aplicar_decision(e.tarea_id, p_resultado, p_comentario, null, true);
end $$;

-- ───────── Usuarios: alta solo por invitación ─────────
create function invitar_usuario(p_email text, p_rol rol_usuario, p_marca_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(btrim(p_email)); v_ag uuid := agencia_actual();
begin
  if not es_rol('administrador') then raise exception 'Solo el administrador puede invitar' using errcode = '42501'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  if exists (select 1 from perfiles where lower(email) = v_email) then raise exception 'Esa persona ya tiene cuenta'; end if;
  if exists (select 1 from invitaciones where lower(email) = v_email and aceptada_en is null and agencia_id <> v_ag) then
    raise exception 'Ese correo ya tiene una invitación pendiente'; end if;
  if exists (select 1 from unnest(p_marca_ids) m where not exists (select 1 from marcas where id = m and agencia_id = v_ag)) then
    raise exception 'Hay una marca que no pertenece a tu agencia'; end if;
  insert into invitaciones (agencia_id, email, rol, marca_ids, invitado_por) values (v_ag, v_email, p_rol, p_marca_ids, auth.uid())
  on conflict (lower(email)) where aceptada_en is null do update set rol = excluded.rol, marca_ids = excluded.marca_ids, creada_en = now();
end $$;

create function actualizar_usuario(p_usuario uuid, p_rol rol_usuario default null, p_estado estado_usuario default null, p_marca_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_ag uuid := agencia_actual();
begin
  if not es_rol('administrador') then raise exception 'Solo el administrador puede cambiar usuarios' using errcode = '42501'; end if;
  if not exists (select 1 from perfiles where id = p_usuario and agencia_id = v_ag) then raise exception 'No encontramos a esa persona'; end if;
  if p_usuario = auth.uid() and (p_rol is not null or p_estado is not null) then raise exception 'No puedes cambiar tu propio rol ni tu estado'; end if;
  update perfiles set rol = coalesce(p_rol, rol), estado = coalesce(p_estado, estado) where id = p_usuario;
  if p_marca_ids is not null then
    if exists (select 1 from unnest(p_marca_ids) m where not exists (select 1 from marcas where id = m and agencia_id = v_ag)) then
      raise exception 'Hay una marca que no pertenece a tu agencia'; end if;
    delete from usuario_marcas where usuario_id = p_usuario;
    insert into usuario_marcas select p_usuario, m from unnest(p_marca_ids) m;
  end if;
end $$;

create function crear_perfil_desde_invitacion() returns trigger language plpgsql security definer set search_path = public as $$
declare inv invitaciones;
begin   -- Rol y marcas salen de la invitación, nunca de datos que envíe la persona al registrarse.
  select * into inv from invitaciones where lower(email) = lower(new.email) and aceptada_en is null;
  if not found then raise exception 'El registro es solo por invitación'; end if;
  insert into perfiles (id, agencia_id, nombre, email, rol)
  values (new.id, inv.agencia_id, coalesce(nullif(new.raw_user_meta_data->>'nombre', ''), split_part(new.email, '@', 1)), new.email, inv.rol);
  insert into usuario_marcas select new.id, m from unnest(inv.marca_ids) m;
  update invitaciones set aceptada_en = now() where id = inv.id;
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users for each row execute function crear_perfil_desde_invitacion();

-- ───────── Indicadores (se calculan al consultar: siempre al día y respetando RLS) ─────────
-- Mismas definiciones que la demostración. Una fila por marca; el período filtra por fecha de publicación
-- (o fecha programada si aún no se publicó). Cumplimiento = publicadas a tiempo ÷ (publicadas + ya vencidas).
create function metricas(p_desde timestamptz default null, p_marca uuid default null)
returns table (marca_id uuid, total int, publicadas int, con_archivo int, pendientes int, atrasadas int,
  base_cumplimiento int, a_tiempo int, cumplimiento numeric, aprobacion_promedio interval, rondas_decididas int, versiones_promedio numeric)
language sql stable set search_path = public as $$
  with base as (
    select t.id, t.marca_id, t.estado, t.fecha_programada,
      (t.publicada_en at time zone a.zona_horaria)::date as publicada_dia,
      (now() at time zone a.zona_horaria)::date as hoy,
      (select count(*) from versiones v where v.tarea_id = t.id) as n_versiones
    from tareas t join marcas m on m.id = t.marca_id join agencias a on a.id = m.agencia_id
    where (p_marca is null or t.marca_id = p_marca)
      and (p_desde is null or case when t.publicada_en is not null then t.publicada_en >= p_desde
                                   else t.fecha_programada >= (p_desde at time zone a.zona_horaria)::date end)
  ), esperas as (
    select b.marca_id, r.decidida_en - r.solicitada_en as espera
    from rondas_aprobacion r join base b on b.id = r.tarea_id where r.decidida_en is not null
  )
  select b.marca_id,
    count(*)::int,
    (count(*) filter (where b.estado = 'publicado'))::int,
    (count(*) filter (where b.n_versiones > 0))::int,
    (count(*) filter (where b.estado <> 'publicado'))::int,
    (count(*) filter (where b.estado <> 'publicado' and b.fecha_programada < b.hoy))::int,
    (count(*) filter (where b.estado = 'publicado' or b.fecha_programada <= b.hoy))::int,
    (count(*) filter (where b.estado = 'publicado' and b.publicada_dia <= b.fecha_programada))::int,
    round(100.0 * count(*) filter (where b.estado = 'publicado' and b.publicada_dia <= b.fecha_programada)
          / nullif(count(*) filter (where b.estado = 'publicado' or b.fecha_programada <= b.hoy), 0), 1),
    (select avg(e.espera) from esperas e where e.marca_id = b.marca_id),
    (select count(*) from esperas e where e.marca_id = b.marca_id)::int,
    round(avg(b.n_versiones) filter (where b.n_versiones > 0), 2)
  from base b group by b.marca_id
$$;

-- Tokens de IA usados por la persona en las últimas 24 h (límite de uso en la ruta de IA).
create function uso_ia_24h() returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(coalesce(m.tokens_entrada, 0) + coalesce(m.tokens_salida, 0)), 0)::bigint
  from mensajes_ia m join conversaciones_ia c on c.id = m.conversacion_id
  where c.usuario_id = auth.uid() and m.creado_en > now() - interval '24 hours'
$$;

-- ───────── Recordatorios de vencimiento (diario) ─────────
create function generar_recordatorios_vencimiento() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select t.id, t.titulo, t.marca_id, t.responsable_id, m.agencia_id,
           t.fecha_programada - (now() at time zone a.zona_horaria)::date as dias
    from tareas t join marcas m on m.id = t.marca_id join agencias a on a.id = m.agencia_id
    where t.estado <> 'publicado'
      and t.fecha_programada between (now() at time zone a.zona_horaria)::date and (now() at time zone a.zona_horaria)::date + 2
  loop
    continue when not _auto_activa(r.agencia_id, 'recordatorio_vencimiento');
    perform _notificar(_destinatarios(r.marca_id, array['community_manager']::rol_usuario[], array[r.responsable_id]),
      format('“%s” vence %s', r.titulo, case r.dias when 0 then 'hoy' when 1 then 'mañana' else 'en 2 días' end),
      r.marca_id, 'tablero', r.id, 'vence:' || r.id || ':' || r.dias);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ───────── Programación y tiempo real (solo si la extensión existe) ─────────
do $$ begin
  create extension if not exists pg_cron;
  perform cron.schedule('recordatorios-vencimiento', '0 13 * * *', 'select public.generar_recordatorios_vencimiento()');  -- 13:00 UTC = 08:00 en Lima
exception when others then
  raise notice 'pg_cron no está disponible (%). Programa generar_recordatorios_vencimiento() desde el panel de Supabase.', sqlerrm;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table notificaciones, tareas;   -- Realtime respeta las políticas RLS
  end if;
end $$;

-- ───────── Superficie de la API: solo lo que la interfaz necesita ─────────
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function agencia_actual(), rol_actual(), es_rol(rol_usuario[]), es_interno(), puede_ver_marca(uuid) to authenticated;
grant execute on function enviar_a_aprobacion(uuid), devolver_a_diseno(uuid), decidir_aprobacion(uuid, resultado_ronda, text),
  confirmar_publicacion(uuid, text, text), convertir_idea_en_tarea(uuid, date, uuid), crear_enlace_aprobacion(uuid, text, int),
  invitar_usuario(text, rol_usuario, uuid[]), actualizar_usuario(uuid, rol_usuario, estado_usuario, uuid[]),
  metricas(timestamptz, uuid), uso_ia_24h() to authenticated;
do $$ begin   -- solo el servidor (service_role) puede usar el enlace seguro
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function decidir_por_enlace(text, resultado_ronda, text), generar_recordatorios_vencimiento() to service_role;
  end if;
end $$;
