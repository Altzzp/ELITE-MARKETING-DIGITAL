-- Élite Digital Marketing · 0002 · Seguridad (RLS, privilegios por columna, Storage)
-- Dos capas: RLS decide QUÉ FILAS ve cada persona; los privilegios por columna deciden QUÉ CAMPOS puede escribir.
-- El estado de una tarea (en_diseno → … → publicado) solo cambia con las funciones de 0003, nunca con un UPDATE directo.

-- ───────── Funciones auxiliares (security definer: leen perfiles sin pasar por RLS) ─────────
create function agencia_actual() returns uuid
language sql stable security definer set search_path = public as $$
  select agencia_id from perfiles where id = auth.uid() and estado = 'activo'
$$;

create function rol_actual() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and estado = 'activo'
$$;

create function es_rol(variadic roles rol_usuario[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(rol_actual() = any(roles), false)
$$;

create function es_interno() returns boolean      -- todo el equipo de la agencia, sin clientes
language sql stable security definer set search_path = public as $$
  select es_rol('administrador','direccion','community_manager','disenador')
$$;

create function puede_ver_marca(p_marca uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from marcas m
    where m.id = p_marca and m.agencia_id = agencia_actual()
      and (es_rol('administrador','direccion')
           or exists (select 1 from usuario_marcas um where um.usuario_id = auth.uid() and um.marca_id = m.id)))
$$;

-- ───────── Activar RLS en todas las tablas ─────────
do $$ declare t text; begin
  foreach t in array array['agencias','perfiles','invitaciones','permisos_rol','clientes','marcas','usuario_marcas',
    'marca_archivos','proyectos','ideas','tareas','versiones','comentarios','rondas_aprobacion','enlaces_aprobacion',
    'publicaciones','notificaciones','auditoria','automatizaciones','reportes_generados','conversaciones_ia',
    'mensajes_ia','referencias_ia']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- ───────── Políticas ─────────
create policy agencias_ver on agencias for select to authenticated using (id = agencia_actual());

create policy perfiles_ver on perfiles for select to authenticated using (
  id = auth.uid() or (agencia_id = agencia_actual() and (rol <> 'cliente' or rol_actual() <> 'cliente')));  -- un cliente no ve a otros clientes
create policy perfiles_editar_propio on perfiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy invitaciones_ver on invitaciones for select to authenticated using (es_rol('administrador') and agencia_id = agencia_actual());

create policy permisos_ver on permisos_rol for select to authenticated using (agencia_id = agencia_actual());
create policy permisos_admin on permisos_rol for all to authenticated
  using (es_rol('administrador') and agencia_id = agencia_actual()) with check (es_rol('administrador') and agencia_id = agencia_actual());

create policy clientes_ver on clientes for select to authenticated using (
  agencia_id = agencia_actual() and (es_rol('administrador','direccion') or exists (select 1 from marcas m where m.cliente_id = clientes.id)));
create policy clientes_crear on clientes for insert to authenticated with check (es_rol('administrador','direccion') and agencia_id = agencia_actual());
create policy clientes_editar on clientes for update to authenticated using (es_rol('administrador','direccion') and agencia_id = agencia_actual());

create policy marcas_ver on marcas for select to authenticated using (puede_ver_marca(id));
create policy marcas_crear on marcas for insert to authenticated with check (es_rol('administrador','direccion') and agencia_id = agencia_actual());
create policy marcas_editar on marcas for update to authenticated
  using (puede_ver_marca(id) and es_rol('administrador','direccion','community_manager'));

create policy usuario_marcas_ver on usuario_marcas for select to authenticated using (
  usuario_id = auth.uid() or (es_interno() and puede_ver_marca(marca_id)));      -- la asignación se escribe con actualizar_usuario()

create policy archivos_ver on marca_archivos for select to authenticated using (puede_ver_marca(marca_id));
create policy archivos_subir on marca_archivos for insert to authenticated with check (es_rol('administrador','direccion','community_manager') and puede_ver_marca(marca_id));
create policy archivos_borrar on marca_archivos for delete to authenticated using (es_rol('administrador','direccion','community_manager') and puede_ver_marca(marca_id));

create policy proyectos_ver on proyectos for select to authenticated using (puede_ver_marca(marca_id));
create policy proyectos_crear on proyectos for insert to authenticated with check (es_rol('administrador','direccion','community_manager') and puede_ver_marca(marca_id));
create policy proyectos_editar on proyectos for update to authenticated using (es_rol('administrador','direccion','community_manager') and puede_ver_marca(marca_id));

create policy ideas_ver on ideas for select to authenticated using (es_interno() and puede_ver_marca(marca_id));   -- las ideas son internas: el cliente no las ve
create policy ideas_crear on ideas for insert to authenticated with check (es_interno() and puede_ver_marca(marca_id));
create policy ideas_editar on ideas for update to authenticated using (es_interno() and puede_ver_marca(marca_id));

-- Diseñador: solo tareas asignadas a él. Cliente: todas las de sus marcas.
create policy tareas_ver on tareas for select to authenticated using (
  puede_ver_marca(marca_id) and (not es_rol('disenador') or responsable_id = auth.uid()));
create policy tareas_crear on tareas for insert to authenticated with check (
  es_interno() and puede_ver_marca(marca_id) and (not es_rol('disenador') or responsable_id = auth.uid()));
create policy tareas_editar on tareas for update to authenticated
  using (es_interno() and puede_ver_marca(marca_id) and (not es_rol('disenador') or responsable_id = auth.uid()))
  with check (puede_ver_marca(marca_id) and (not es_rol('disenador') or responsable_id = auth.uid()));

-- Las tablas hijas heredan la visibilidad de la tarea: el subselect pasa por la política tareas_ver.
create policy versiones_ver on versiones for select to authenticated using (exists (select 1 from tareas t where t.id = tarea_id));
create policy versiones_subir on versiones for insert to authenticated with check (es_interno() and exists (select 1 from tareas t where t.id = tarea_id));
create policy comentarios_ver on comentarios for select to authenticated using (exists (select 1 from tareas t where t.id = tarea_id));
create policy comentarios_crear on comentarios for insert to authenticated with check (
  autor_id = auth.uid() and tipo = 'nota' and not via_enlace and exists (select 1 from tareas t where t.id = tarea_id));
create policy rondas_ver on rondas_aprobacion for select to authenticated using (exists (select 1 from tareas t where t.id = tarea_id));
create policy enlaces_ver on enlaces_aprobacion for select to authenticated using (
  es_rol('administrador','direccion','community_manager') and exists (select 1 from tareas t where t.id = tarea_id));
create policy publicaciones_ver on publicaciones for select to authenticated using (puede_ver_marca(marca_id));

create policy notif_ver on notificaciones for select to authenticated using (usuario_id = auth.uid());
create policy notif_leer on notificaciones for update to authenticated using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

create policy auditoria_ver on auditoria for select to authenticated using (
  agencia_id = agencia_actual() and (es_rol('administrador','direccion') or (es_rol('community_manager') and puede_ver_marca(marca_id))));

create policy automatizaciones_ver on automatizaciones for select to authenticated using (agencia_id = agencia_actual());
create policy automatizaciones_editar on automatizaciones for update to authenticated
  using (es_rol('administrador') and agencia_id = agencia_actual() and modificable);

create policy reportes_ver on reportes_generados for select to authenticated using (
  agencia_id = agencia_actual() and (es_rol('administrador','direccion') or (marca_id is not null and puede_ver_marca(marca_id))));

-- Conversaciones con IA: privadas de cada persona.
create policy conv_ia_todo on conversaciones_ia for all to authenticated
  using (usuario_id = auth.uid() and es_interno() and puede_ver_marca(marca_id))
  with check (usuario_id = auth.uid() and es_interno() and puede_ver_marca(marca_id));
create policy mensajes_ia_todo on mensajes_ia for all to authenticated
  using (exists (select 1 from conversaciones_ia c where c.id = conversacion_id))
  with check (exists (select 1 from conversaciones_ia c where c.id = conversacion_id));
create policy refs_ia_todo on referencias_ia for all to authenticated
  using (exists (select 1 from conversaciones_ia c where c.id = conversacion_id))
  with check (exists (select 1 from conversaciones_ia c where c.id = conversacion_id));

-- ───────── Privilegios: partir de cero y conceder solo lo necesario ─────────
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;  -- Supabase las concede por defecto

grant select on agencias, perfiles, invitaciones, permisos_rol, clientes, marcas, usuario_marcas, marca_archivos, proyectos,
  ideas, tareas, versiones, comentarios, rondas_aprobacion, publicaciones, notificaciones, auditoria, automatizaciones,
  reportes_generados, conversaciones_ia, mensajes_ia, referencias_ia to authenticated;
grant select (id, tarea_id, expira_en, revocado_en, usado_en, creado_por, creado_en) on enlaces_aprobacion to authenticated;  -- nunca token_hash

grant update (nombre, tema) on perfiles to authenticated;                          -- rol y estado: solo actualizar_usuario()
grant insert, update, delete on permisos_rol to authenticated;
grant insert (nombre, contacto, agencia_id), update (nombre, contacto) on clientes to authenticated;
grant insert (agencia_id, cliente_id, nombre, nombre_corto, sector, publico_objetivo, tono, paleta, tipografias, redes, brief, logo_ruta) on marcas to authenticated;
grant update (nombre, nombre_corto, sector, publico_objetivo, tono, paleta, tipografias, redes, brief, logo_ruta, activa) on marcas to authenticated;
grant insert (marca_id, nombre, ruta_storage, bytes), delete on marca_archivos to authenticated;
grant insert (marca_id, nombre), update (nombre) on proyectos to authenticated;
grant insert (marca_id, proyecto_id, titulo, descripcion, formato, origen), update (proyecto_id, titulo, descripcion, formato, estado) on ideas to authenticated;
-- estado, aprobacion y publicada_en NO están en la lista: no se pueden escribir directamente.
grant insert (marca_id, proyecto_id, idea_id, titulo, formato, fecha_programada, responsable_id) on tareas to authenticated;
grant update (proyecto_id, titulo, formato, fecha_programada, responsable_id) on tareas to authenticated;
grant insert (tarea_id, nota, archivo_ruta) on versiones to authenticated;
grant insert (tarea_id, texto) on comentarios to authenticated;
grant update (leida_en) on notificaciones to authenticated;
grant update (activa) on automatizaciones to authenticated;
grant insert (marca_id, titulo, proveedor, modo), update (titulo, proveedor, modo, actualizada_en) , delete on conversaciones_ia to authenticated;
grant insert (conversacion_id, rol, modo, texto, elementos, proveedor, modelo, tokens_entrada, tokens_salida) on mensajes_ia to authenticated;
grant insert (conversacion_id, red, titulo, url), delete on referencias_ia to authenticated;

grant execute on function agencia_actual(), rol_actual(), es_rol(rol_usuario[]), es_interno(), puede_ver_marca(uuid) to authenticated;
revoke execute on function agencia_actual(), rol_actual(), es_rol(rol_usuario[]), es_interno(), puede_ver_marca(uuid) from public, anon;

-- ───────── Storage (solo si el esquema existe): rutas {agencia}/{marca}/… ─────────
do $storage$ begin
  if to_regclass('storage.objects') is null then raise notice 'Sin Storage: se omiten las políticas de archivos.'; return; end if;
  insert into storage.buckets (id, name, public) values ('piezas','piezas',false), ('marcas','marcas',false) on conflict (id) do nothing;
  execute $p$create policy elite_archivos_ver on storage.objects for select to authenticated
    using (bucket_id in ('piezas','marcas') and puede_ver_marca(((storage.foldername(name))[2])::uuid))$p$;
  execute $p$create policy elite_archivos_subir on storage.objects for insert to authenticated
    with check (((bucket_id = 'piezas' and es_interno()) or (bucket_id = 'marcas' and es_rol('administrador','direccion','community_manager')))
      and puede_ver_marca(((storage.foldername(name))[2])::uuid))$p$;
end $storage$;
