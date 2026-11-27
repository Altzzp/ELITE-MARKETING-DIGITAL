-- Élite Digital Marketing · 0005 · Administración de usuarios desde la aplicación
-- Hasta 0004 el Administrador solo podía invitar, cambiar rol/estado/marcas y (con SQL directo) tocar permisos.
-- Esta migración añade lo que falta para la pantalla "Usuarios y roles" y evita que alguien se bloquee a sí mismo.

-- ───────── 1. Revocar una invitación pendiente ─────────
create function revocar_invitacion(p_invitacion uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not es_rol('administrador') then raise exception 'Solo el administrador puede revocar invitaciones' using errcode = '42501'; end if;
  delete from invitaciones where id = p_invitacion and agencia_id = agencia_actual() and aceptada_en is null;
  if not found then raise exception 'No encontramos esa invitación pendiente'; end if;
end $$;

-- ───────── 2. Activar o desactivar un módulo para un rol ─────────
create function cambiar_permiso(p_rol rol_usuario, p_modulo modulo_app, p_activo boolean) returns void
language plpgsql security definer set search_path = public as $$
declare v_ag uuid := agencia_actual();
begin
  if not es_rol('administrador') then raise exception 'Solo el administrador puede cambiar permisos' using errcode = '42501'; end if;
  if p_activo then
    insert into permisos_rol (agencia_id, rol, modulo) values (v_ag, p_rol, p_modulo) on conflict do nothing;
  else
    delete from permisos_rol where agencia_id = v_ag and rol = p_rol and modulo = p_modulo;   -- el disparador de abajo protege lo esencial
  end if;
end $$;

-- ───────── 3. Lo esencial no se puede quitar (ni con esta función ni con un DELETE/UPDATE directo) ─────────
-- · El Administrador siempre conserva Panel y Usuarios y roles: sin ellos nadie podría volver a dar permisos.
-- · Apariencia está disponible para todos los roles (cada persona elige su modo claro u oscuro).
create function proteger_permisos_esenciales() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.agencia_id, new.rol, new.modulo) is not distinct from (old.agencia_id, old.rol, old.modulo) then return new; end if;   -- sin cambios en lo que importa
  end if;
  if not exists (select 1 from agencias where id = old.agencia_id) then return old; end if;   -- borrado en cascada de una agencia entera
  if old.modulo = 'apariencia' then
    raise exception 'Apariencia está disponible para todos los roles y no se puede quitar';
  elsif old.rol = 'administrador' and old.modulo in ('panel', 'usuarios') then
    raise exception 'El Administrador siempre necesita Panel y Usuarios y roles; sin ellos nadie podría administrar la plataforma';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end $$;
create trigger permisos_esenciales before update or delete on permisos_rol for each row execute function proteger_permisos_esenciales();

-- ───────── Superficie de la API (mismo criterio que 0003) ─────────
revoke execute on function revocar_invitacion(uuid), cambiar_permiso(rol_usuario, modulo_app, boolean), proteger_permisos_esenciales() from public, anon, authenticated;
grant execute on function revocar_invitacion(uuid), cambiar_permiso(rol_usuario, modulo_app, boolean) to authenticated;
