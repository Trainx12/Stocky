-- "Actividad reciente" de HomeScreen era un estado vacío fijo -- no existía
-- ningún registro de qué se hizo en un hogar. Esta migración agrega una
-- tabla de actividad simple, alimentada automáticamente por triggers sobre
-- `productos` (RF7, lo único con ABM real hoy): no hace falta que cada
-- pantalla se acuerde de loguear a mano, ni arriesgarse a que alguien
-- agregue un producto por afuera de `productos.ts` y la actividad quede
-- sin registrar.

create table if not exists public.actividad_hogar (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  -- Quién hizo la acción. Nullable + on delete set null (no cascade): si se
  -- borra la cuenta del usuario, el registro de actividad del hogar no
  -- tiene por qué desaparecer con él -- solo pierde el autor.
  usuario_id uuid references public.usuarios (id) on delete set null,
  tipo text not null,
  descripcion text not null,
  created_at timestamptz not null default now()
);

comment on table public.actividad_hogar is 'Historial de acciones sobre un hogar (hoy solo ABM de productos), para "Actividad reciente" en HomeScreen.';

create index if not exists actividad_hogar_hogar_id_created_at_idx
  on public.actividad_hogar (hogar_id, created_at desc);

alter table public.actividad_hogar enable row level security;

-- Mismo criterio de acceso que `productos`: cualquier miembro del hogar (o
-- admin) puede ver su actividad -- no hace falta ser el dueño.
create policy "actividad_hogar_select_miembro_o_admin"
  on public.actividad_hogar for select
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());

-- Sin policies de insert/update/delete a propósito: la única forma de
-- escribir acá es el trigger de abajo (SECURITY DEFINER, bypasea RLS). Si
-- en algún momento hace falta que el cliente borre actividad vieja a mano,
-- se agrega una policy puntual entonces.
revoke insert, update, delete on public.actividad_hogar from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Trigger sobre productos: registra alta/edición/baja sin que
-- src/services/productos.ts tenga que acordarse de hacerlo a mano en cada
-- función. SECURITY DEFINER (mismo patrón que los helpers de RLS) porque
-- quien inserta/edita/borra un producto es un usuario común sin permiso de
-- escritura directa en actividad_hogar.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_actividad_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion)
    values (NEW.hogar_id, auth.uid(), 'producto_creado', 'Se agregó "' || NEW.nombre || '"');
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion)
    values (NEW.hogar_id, auth.uid(), 'producto_editado', 'Se actualizó "' || NEW.nombre || '"');
    return NEW;
  else
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion)
    values (OLD.hogar_id, auth.uid(), 'producto_eliminado', 'Se eliminó "' || OLD.nombre || '"');
    return OLD;
  end if;
end;
$$;

drop trigger if exists productos_registrar_actividad on public.productos;
create trigger productos_registrar_actividad
  after insert or update or delete on public.productos
  for each row execute function public.registrar_actividad_producto();

-- ---------------------------------------------------------------------------
-- listar_actividad_reciente(): trae las últimas N filas de un hogar con
-- nombre/email de quien hizo la acción (join a usuarios). Va por RPC en vez
-- de un select anidado directo desde el cliente porque usuario_id puede ser
-- null (cuenta borrada) y el join normal de PostgREST no maneja bien ese
-- caso opcional para esta tabla nueva -- más simple resolverlo acá.
-- ---------------------------------------------------------------------------
create or replace function public.listar_actividad_reciente(p_hogar_id uuid, p_limite int default 10)
returns table (
  id uuid,
  tipo text,
  descripcion text,
  usuario_nombre text,
  usuario_email text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.tipo,
    a.descripcion,
    u.nombre,
    u.email,
    a.created_at
  from public.actividad_hogar a
  left join public.usuarios u on u.id = a.usuario_id
  where a.hogar_id = p_hogar_id
    and (public.hogar_id_actual() = p_hogar_id or public.es_miembro_de(p_hogar_id) or public.es_administrador())
  order by a.created_at desc
  limit greatest(p_limite, 0);
$$;

revoke execute on function public.listar_actividad_reciente(uuid, int) from public;
grant execute on function public.listar_actividad_reciente(uuid, int) to authenticated;
