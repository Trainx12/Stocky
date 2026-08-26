-- Un usuario ahora puede pertenecer a MÁS de un hogar (puede crear uno y
-- además unirse a otros ya existentes). Antes `usuarios.hogar_id` era la
-- única referencia (1 hogar por usuario). Para no romper nada existente,
-- esa columna NO se borra: pasa a significar "hogar activo" (el que
-- muestra HomeScreen), y se agrega `hogar_miembros` para la relación real
-- de muchos a muchos. Todo el código que ya lee `usuario.hogar_id` sigue
-- andando igual, apuntando a uno de los hogares del usuario.

-- ---------------------------------------------------------------------------
-- Código de invitación: para "unirse" a un hogar hace falta compartir un
-- código corto, no el uuid completo.
-- ---------------------------------------------------------------------------
alter table public.hogares
  add column if not exists codigo_invitacion text;

-- Genera un código de 6 caracteres (sin 0/O/1/I, para no confundirlos al
-- transcribirlo a mano) y reintenta si por casualidad choca con uno ya
-- existente.
create or replace function public.generar_codigo_invitacion()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  codigo text;
begin
  loop
    codigo := '';
    for i in 1..6 loop
      codigo := codigo || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    exit when not exists (select 1 from public.hogares where codigo_invitacion = codigo);
  end loop;
  return codigo;
end;
$$;

-- Completa el código a los hogares que ya existían antes de esta migración.
update public.hogares set codigo_invitacion = public.generar_codigo_invitacion() where codigo_invitacion is null;

alter table public.hogares
  alter column codigo_invitacion set not null,
  alter column codigo_invitacion set default public.generar_codigo_invitacion();

alter table public.hogares
  add constraint hogares_codigo_invitacion_unique unique (codigo_invitacion);

-- ---------------------------------------------------------------------------
-- hogar_miembros: relación N a N real entre usuarios y hogares.
-- ---------------------------------------------------------------------------
create table if not exists public.hogar_miembros (
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hogar_id, usuario_id)
);

comment on table public.hogar_miembros is 'Relación N a N: a qué hogares pertenece cada usuario. usuarios.hogar_id sigue existiendo como "hogar activo" (el que se ve en Home), no como la única membresía.';

create index if not exists hogar_miembros_usuario_id_idx on public.hogar_miembros (usuario_id);

-- Migra los datos existentes: todo el que ya tenía usuarios.hogar_id
-- seteado pasa a tener también su fila de membresía correspondiente.
insert into public.hogar_miembros (hogar_id, usuario_id)
select hogar_id, id from public.usuarios where hogar_id is not null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helper de RLS nuevo: "¿el usuario logueado es miembro de este hogar?".
-- security definer por el mismo motivo que hogar_id_actual()/es_administrador()
-- (ver 20260823120003_create_helper_functions.sql): evita recursión al
-- usarse dentro de policies que consultan estas mismas tablas.
-- ---------------------------------------------------------------------------
create or replace function public.es_miembro_de(p_hogar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid()
  );
$$;

alter table public.hogar_miembros enable row level security;

create policy "hogar_miembros_select_propio_o_hogar_compartido_o_admin"
  on public.hogar_miembros for select
  using (
    usuario_id = auth.uid()
    or public.es_miembro_de(hogar_id)
    or public.es_administrador()
  );

create policy "hogar_miembros_insert_propio"
  on public.hogar_miembros for insert
  to authenticated
  with check (usuario_id = auth.uid());

create policy "hogar_miembros_delete_propio_o_admin"
  on public.hogar_miembros for delete
  using (usuario_id = auth.uid() or public.es_administrador());

-- ---------------------------------------------------------------------------
-- Se amplían (no se restringen) las policies de "hogares" y "productos"
-- que ya existían: además de "es tu hogar activo" o "sos admin", ahora
-- también alcanza con "sos miembro" (aunque ese hogar no sea el activo).
-- ---------------------------------------------------------------------------
drop policy if exists "hogares_select_propio_o_admin" on public.hogares;
create policy "hogares_select_propio_o_miembro_o_admin"
  on public.hogares for select
  using (id = public.hogar_id_actual() or public.es_miembro_de(id) or public.es_administrador());

drop policy if exists "hogares_update_propio_o_admin" on public.hogares;
create policy "hogares_update_propio_o_miembro_o_admin"
  on public.hogares for update
  using (id = public.hogar_id_actual() or public.es_miembro_de(id) or public.es_administrador());

drop policy if exists "productos_select_propio_hogar_o_admin" on public.productos;
create policy "productos_select_propio_hogar_o_miembro_o_admin"
  on public.productos for select
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());

drop policy if exists "productos_insert_propio_hogar" on public.productos;
create policy "productos_insert_propio_hogar_o_miembro"
  on public.productos for insert
  to authenticated
  with check (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id));

drop policy if exists "productos_update_propio_hogar_o_admin" on public.productos;
create policy "productos_update_propio_hogar_o_miembro_o_admin"
  on public.productos for update
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador())
  with check (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());

drop policy if exists "productos_delete_propio_hogar_o_admin" on public.productos;
create policy "productos_delete_propio_hogar_o_miembro_o_admin"
  on public.productos for delete
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());

-- ---------------------------------------------------------------------------
-- RPCs: crear hogar, unirse por código y darse de baja. Cada una toca más
-- de una tabla (hogares + hogar_miembros, o usuarios + hogar_miembros) y
-- tiene que ser atómica, por eso van como función en vez de resolverse con
-- varios .insert()/.update() sueltos desde el cliente.
-- ---------------------------------------------------------------------------

-- Crea un hogar nuevo, suma al usuario actual como miembro y, si todavía
-- no tenía un hogar activo, lo deja seteado como tal. Devuelve la fila del
-- hogar creado (incluye el código de invitación, para compartirlo).
create or replace function public.crear_hogar(p_nombre text)
returns public.hogares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hogar public.hogares;
begin
  if p_nombre is null or length(trim(p_nombre)) = 0 then
    raise exception 'El nombre del hogar no puede estar vacío';
  end if;

  insert into public.hogares (nombre) values (trim(p_nombre)) returning * into v_hogar;
  insert into public.hogar_miembros (hogar_id, usuario_id) values (v_hogar.id, auth.uid());

  update public.usuarios set hogar_id = v_hogar.id where id = auth.uid() and hogar_id is null;

  return v_hogar;
end;
$$;

revoke execute on function public.crear_hogar(text) from public;
grant execute on function public.crear_hogar(text) to authenticated;

-- Une al usuario actual a un hogar existente a partir de su código de
-- invitación (no distingue mayúsculas/minúsculas ni espacios alrededor).
-- Si ya era miembro, no falla: simplemente no duplica la fila.
create or replace function public.unirse_a_hogar(p_codigo text)
returns public.hogares
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hogar public.hogares;
begin
  select * into v_hogar from public.hogares where codigo_invitacion = upper(trim(p_codigo));

  if v_hogar.id is null then
    raise exception 'No existe ningún hogar con ese código de invitación';
  end if;

  insert into public.hogar_miembros (hogar_id, usuario_id)
  values (v_hogar.id, auth.uid())
  on conflict (hogar_id, usuario_id) do nothing;

  update public.usuarios set hogar_id = v_hogar.id where id = auth.uid() and hogar_id is null;

  return v_hogar;
end;
$$;

revoke execute on function public.unirse_a_hogar(text) from public;
grant execute on function public.unirse_a_hogar(text) to authenticated;

-- Da de baja al usuario actual de un hogar puntual. Si ese hogar era el
-- "activo" (usuarios.hogar_id), se reasigna solo a otro de sus hogares
-- restantes (o a null si no le queda ninguno), para que Home nunca quede
-- apuntando a un hogar del que ya no es miembro.
create or replace function public.salir_de_hogar(p_hogar_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_siguiente_hogar uuid;
begin
  delete from public.hogar_miembros where hogar_id = p_hogar_id and usuario_id = auth.uid();

  select hogar_id into v_siguiente_hogar
  from public.hogar_miembros
  where usuario_id = auth.uid()
  order by created_at asc
  limit 1;

  update public.usuarios
  set hogar_id = v_siguiente_hogar
  where id = auth.uid() and hogar_id = p_hogar_id;
end;
$$;

revoke execute on function public.salir_de_hogar(uuid) from public;
grant execute on function public.salir_de_hogar(uuid) to authenticated;
