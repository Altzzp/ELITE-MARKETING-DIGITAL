-- Élite Digital Marketing · 0004 · Registro de uso de IA (el límite de gasto no se puede reiniciar)
-- Corrige 0003: uso_ia_24h() sumaba los tokens de mensajes_ia, pero cualquier persona puede borrar sus conversaciones
-- (los mensajes se borran en cascada) o insertar tokens negativos, y así volver a cero su consumo.
-- Ahora el consumo va a un registro que solo admite altas, con valores no negativos y sin borrado ni edición.

create table uso_ia (
  id             bigint generated always as identity primary key,
  usuario_id     uuid not null default auth.uid() references perfiles(id) on delete cascade,
  proveedor      proveedor_ia not null,
  modelo         text not null,
  tokens_entrada int not null check (tokens_entrada between 0 and 10000000),
  tokens_salida  int not null check (tokens_salida between 0 and 10000000),
  creado_en      timestamptz not null default now()
);
create index uso_ia_usuario_idx on uso_ia (usuario_id, creado_en desc);

alter table uso_ia enable row level security;
create policy uso_ia_ver on uso_ia for select to authenticated using (usuario_id = auth.uid());
create policy uso_ia_registrar on uso_ia for insert to authenticated with check (usuario_id = auth.uid() and es_interno());

revoke all on uso_ia from anon, authenticated;
grant select on uso_ia to authenticated;
grant insert (proveedor, modelo, tokens_entrada, tokens_salida) on uso_ia to authenticated;   -- usuario_id siempre es auth.uid(); sin update ni delete

-- Mismo contrato que en 0003 (la ruta de IA no cambia), pero leyendo del registro.
create or replace function uso_ia_24h() returns bigint language sql stable set search_path = public as $$
  select coalesce(sum(tokens_entrada::bigint + tokens_salida), 0)::bigint
  from uso_ia
  where usuario_id = auth.uid() and creado_en > now() - interval '24 hours'
$$;

-- Orden estable de los mensajes: pregunta y respuesta se guardan en una sola operación y comparten creado_en.
alter table mensajes_ia add column orden bigint generated always as identity;
create index mensajes_orden_idx on mensajes_ia (conversacion_id, orden);
