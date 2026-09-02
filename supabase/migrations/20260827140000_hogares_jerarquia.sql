-- Jerarquía dentro de un hogar: quien lo creó es "dueño", quien se suma
-- después por código de invitación es "invitado". La garantía real de
-- esta jerarquía es que el dueño no puede ser expulsado por nadie más
-- (ni siquiera por otro dueño de otro hogar, ni por un admin de la
-- plataforma vía esta RPC puntual) -- solo puede dejar de ser miembro
-- yéndose voluntariamente (salir_de_hogar, que no cambia).

-- El valor 'dueno' se guarda sin ñ a propósito (evita cualquier problema
-- de encoding en el enum en sí); la UI es la que muestra "Dueño".
create type public.rol_hogar as enum ('dueno', 'invitado');

alter table public.hogar_miembros
  add column if not exists rol public.rol_hogar not null default 'invitado';

-- Migración de datos: para los hogares que ya existían antes de esta
-- migración, no se guardó en ningún lado quién lo creó originalmente. La
-- mejor aproximación disponible es "el miembro más antiguo de ese hogar"
-- (el primero que tiene una fila en hogar_miembros por created_at).
with primer_miembro as (
  select distinct on (hogar_id) hogar_id, usuario_id
  from public.hogar_miembros
  order by hogar_id, created_at asc
)
update public.hogar_miembros hm
set rol = 'dueno'
from primer_miembro pm
where hm.hogar_id = pm.hogar_id and hm.usuario_id = pm.usuario_id;

-- ---------------------------------------------------------------------------
-- Helper de RLS nuevo, mismo patrón que es_miembro_de()/es_administrador():
-- SECURITY DEFINER para no entrar en recursión al usarse dentro de
-- policies que consultan esta misma tabla.
-- ---------------------------------------------------------------------------
create or replace function public.es_dueno_de(p_hogar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and rol = 'dueno'
  );
$$;

-- ---------------------------------------------------------------------------
-- crear_hogar()/unirse_a_hogar(): ahora asignan el rol explícitamente en
-- vez de depender del default de la columna, para que quede claro en el
-- código (y no solo en el esquema) que esta es la única fuente de verdad
-- de quién es dueño.
-- ---------------------------------------------------------------------------
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
  insert into public.hogar_miembros (hogar_id, usuario_id, rol) values (v_hogar.id, auth.uid(), 'dueno');

  update public.usuarios set hogar_id = v_hogar.id where id = auth.uid() and hogar_id is null;

  return v_hogar;
end;
$$;

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

  insert into public.hogar_miembros (hogar_id, usuario_id, rol)
  values (v_hogar.id, auth.uid(), 'invitado')
  on conflict (hogar_id, usuario_id) do nothing;

  update public.usuarios set hogar_id = v_hogar.id where id = auth.uid() and hogar_id is null;

  return v_hogar;
end;
$$;

-- ---------------------------------------------------------------------------
-- expulsar_miembro(): la única forma de sacar a OTRO usuario de un hogar
-- (a diferencia de salir_de_hogar, que es uno mismo yéndose). Dos guardas
-- independientes protegen al dueño, a propósito redundantes:
--   1. Solo el dueño puede llamar a esta función.
--   2. El delete explícitamente excluye filas con rol = 'dueno', así que
--      aunque en el futuro alguien agregue una segunda forma de invocar
--      esto (o un bug rompa la guarda #1), la fila del dueño nunca se
--      borra desde acá.
-- ---------------------------------------------------------------------------
create or replace function public.expulsar_miembro(p_hogar_id uuid, p_usuario_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_dueno_de(p_hogar_id) then
    raise exception 'Solo el dueño del hogar puede expulsar miembros';
  end if;

  if p_usuario_id = auth.uid() then
    raise exception 'No podés expulsarte a vos mismo (para eso está "Salir del hogar")';
  end if;

  delete from public.hogar_miembros
  where hogar_id = p_hogar_id and usuario_id = p_usuario_id and rol <> 'dueno';

  -- Si el hogar del que se lo expulsó era su hogar "activo", se le
  -- reasigna a otro de sus hogares restantes (o a null), mismo patrón que
  -- salir_de_hogar.
  update public.usuarios
  set hogar_id = (
    select hogar_id from public.hogar_miembros
    where usuario_id = p_usuario_id
    order by created_at asc
    limit 1
  )
  where id = p_usuario_id and hogar_id = p_hogar_id;
end;
$$;

revoke execute on function public.expulsar_miembro(uuid, uuid) from public;
grant execute on function public.expulsar_miembro(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Se amplía la policy de SELECT de "usuarios": todavía usaba solo
-- hogar_id_actual() (el hogar "activo"), de antes de que existiera la
-- multi-membresía -- así que no dejaba ver a un compañero de un hogar del
-- que sos miembro pero que no es tu hogar activo. Necesario para poder
-- listar nombre/email de los miembros de CUALQUIER hogar propio (no solo
-- el activo) en la pantalla de "Miembros del hogar".
-- ---------------------------------------------------------------------------
drop policy if exists "usuarios_select_propio_hogar_o_admin" on public.usuarios;
create policy "usuarios_select_propio_hogar_o_companero_o_admin"
  on public.usuarios for select
  using (
    id = auth.uid()
    or hogar_id = public.hogar_id_actual()
    or exists (
      select 1 from public.hogar_miembros hm
      where hm.usuario_id = usuarios.id and public.es_miembro_de(hm.hogar_id)
    )
    or public.es_administrador()
  );
