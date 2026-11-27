-- Élite Digital Marketing · 0006 · Lecturas del Panel
-- Los indicadores del Panel salen de metricas() (0003). Esta migración añade dos lecturas que faltaban:
--   · tareas_por_estado(): cuántas piezas hay en cada estado del tablero (en diseño / en revisión / aprobado / publicado).
--   · versiones_recientes(): lo último que se subió, con la pieza, la marca y quién lo subió.
-- Ambas son funciones normales (security invoker): las políticas RLS deciden qué ve cada persona
-- (Diseñador: solo lo asignado; Cliente: solo sus marcas), igual que si consultara las tablas directamente.

create function tareas_por_estado(p_marca uuid default null) returns table (estado estado_tarea, total int)
language sql stable set search_path = public as $$
  select e.estado, count(t.id)::int
  from unnest(enum_range(null::estado_tarea)) as e(estado)
  left join tareas t on t.estado = e.estado and (p_marca is null or t.marca_id = p_marca)
  group by e.estado
  order by e.estado
$$;

create function versiones_recientes(p_marca uuid default null, p_limite int default 6)
returns table (tarea_id uuid, numero int, titulo text, marca_id uuid, formato formato_pieza, autor text, creado_en timestamptz)
language sql stable set search_path = public as $$
  select v.tarea_id, v.numero, t.titulo, t.marca_id, t.formato, p.nombre, v.creado_en
  from versiones v
  join tareas t on t.id = v.tarea_id
  left join perfiles p on p.id = v.creado_por
  where p_marca is null or t.marca_id = p_marca
  order by v.creado_en desc, v.numero desc
  limit least(greatest(coalesce(p_limite, 6), 1), 50)
$$;

-- Superficie de la API (mismo criterio que 0003 y 0005)
revoke execute on function tareas_por_estado(uuid), versiones_recientes(uuid, int) from public, anon, authenticated;
grant execute on function tareas_por_estado(uuid), versiones_recientes(uuid, int) to authenticated;
