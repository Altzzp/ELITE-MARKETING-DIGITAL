-- Primer arranque: crea tu agencia y deja invitado al primer Administrador.
--
-- Por qué hace falta: en este sistema nadie puede registrarse sin una invitación, y solo un Administrador
-- puede invitar. Para la primera persona se rompe ese círculo con este script, que se ejecuta con los
-- permisos del editor SQL de Supabase (no los de la aplicación).
--
-- Cuándo: UNA sola vez, después de aplicar las migraciones 0001 a 0009 y ANTES de crear tu usuario.
-- Cómo:   1) cambia el correo y, si quieres, el nombre de la agencia (líneas marcadas);
--         2) pégalo en Supabase → SQL Editor y ejecútalo;
--         3) en Authentication → Users → Add user, crea tu usuario con ESE MISMO correo.
--            Al crearlo, el sistema te asigna el rol Administrador. Desde ahí invitas al resto en Usuarios y roles → Invitar persona.
do $$
declare
  v_correo  text := lower(trim('tu-correo@ejemplo.com'));   -- ← CAMBIA ESTO por tu correo real
  v_agencia text := 'Élite Digital Marketing';              -- ← nombre de la agencia
  v_zona    text := 'America/Lima';                         -- define qué día es "hoy" para vencimientos y reportes
  v_id      uuid;
begin
  if v_correo like '%@ejemplo.com' then
    raise exception 'Cambia el correo de ejemplo por el tuyo antes de ejecutar este script';
  end if;
  if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'El correo no es válido: %', v_correo;
  end if;
  if exists (select 1 from agencias) then
    raise exception 'Ya existe una agencia: este script es solo para el primer arranque. Invita a más personas desde la aplicación';
  end if;

  insert into agencias (nombre, zona_horaria) values (v_agencia, v_zona) returning id into v_id;   -- el trigger siembra permisos por rol y automatizaciones
  insert into invitaciones (agencia_id, email, rol) values (v_id, v_correo, 'administrador');
end $$;
