-- "Actividad reciente" mostraba solo texto plano ('Se agregó "Pera"'), sin
-- ninguna pista visual de si fue un alta o una baja. Se agregan dos
-- columnas nuevas para que el cliente arme un badge tipo "Pera +3" en verde
-- (alta) o "Pera -3" en rojo (baja) sin tener que parsear `descripcion`
-- (que sigue existiendo tal cual, para 'producto_editado' y como fallback
-- de cualquier tipo de actividad futuro que no tenga este tratamiento).

alter table public.actividad_hogar
  add column if not exists producto_nombre text,
  add column if not exists cantidad integer;

-- ---------------------------------------------------------------------------
-- registrar_actividad_producto(): mismo trigger de antes, ahora completando
-- también producto_nombre/cantidad en alta y baja (la cantidad relevante es
-- la que se agregó o se sacó de la despensa, no un delta de edición -- por
-- eso 'producto_editado' sigue sin esas dos columnas, con null).
-- ---------------------------------------------------------------------------
create or replace function public.registrar_actividad_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (NEW.hogar_id, auth.uid(), 'producto_creado', 'Se agregó "' || NEW.nombre || '"', NEW.nombre, NEW.cantidad);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion)
    values (NEW.hogar_id, auth.uid(), 'producto_editado', 'Se actualizó "' || NEW.nombre || '"');
    return NEW;
  else
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (OLD.hogar_id, auth.uid(), 'producto_eliminado', 'Se eliminó "' || OLD.nombre || '"', OLD.nombre, OLD.cantidad);
    return OLD;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- listar_actividad_reciente(): suma producto_nombre/cantidad al select. El
-- tipo de retorno (definido por los OUT params de la tabla) cambia, así que
-- hace falta un DROP explícito antes de recrearla -- Postgres no deja hacer
-- CREATE OR REPLACE cuando cambia la forma de las columnas de salida.
-- ---------------------------------------------------------------------------
drop function if exists public.listar_actividad_reciente(uuid, int);

create or replace function public.listar_actividad_reciente(p_hogar_id uuid, p_limite int default 10)
returns table (
  id uuid,
  tipo text,
  descripcion text,
  usuario_nombre text,
  usuario_email text,
  created_at timestamptz,
  producto_nombre text,
  cantidad integer
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
    a.created_at,
    a.producto_nombre,
    a.cantidad
  from public.actividad_hogar a
  left join public.usuarios u on u.id = a.usuario_id
  where a.hogar_id = p_hogar_id
    and (public.hogar_id_actual() = p_hogar_id or public.es_miembro_de(p_hogar_id) or public.es_administrador())
  order by a.created_at desc
  limit greatest(p_limite, 0);
$$;

revoke execute on function public.listar_actividad_reciente(uuid, int) from public;
grant execute on function public.listar_actividad_reciente(uuid, int) to authenticated;
