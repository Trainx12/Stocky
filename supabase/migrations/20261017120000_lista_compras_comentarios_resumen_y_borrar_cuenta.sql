-- Mejoras de experiencia (Sprint 10, rama feature/mejoras-experiencia):
--   1. Lista de compras compartida por hogar.
--   2. Comentarios ("Contanos qué mejorar") que leen los administradores.
--   3. Resumen del mes de un hogar (cargados, usados, vencidos).
--   4. Borrar mi cuenta (lo prometen los Términos, y Google Play lo exige).
-- Mismos criterios que el resto del esquema: RLS en todo, funciones
-- SECURITY DEFINER con search_path fijo, y las consultas "de un hogar"
-- chequean membresía explícitamente (docs/incidentes-sprint*.md).

-- ---------------------------------------------------------------------------
-- 1. Lista de compras
-- ---------------------------------------------------------------------------
-- Un ítem por cosa a comprar. Los miembros del hogar la ven y la editan
-- entre todos (tildan lo que ya compraron). Al tocar "Guardé las compras",
-- la app carga lo tildado en la despensa y borra esos ítems de la lista.
create table public.lista_compras (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  -- Identidad del producto cuando se cargue en la despensa (si coincide con
  -- el catálogo, salen de ahí; si no, "Otros" y "unidad").
  categoria text not null default 'Otros',
  unidad text not null default 'unidad'
    check (unidad in ('unidad', 'kg', 'g', 'l', 'ml', 'paquete')),
  cantidad numeric not null default 1 check (cantidad > 0 and cantidad <= 10000),
  catalogo_id uuid references public.productos_catalogo(id) on delete set null,
  comprado boolean not null default false,
  creado_por uuid default auth.uid() references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);

create index lista_compras_hogar_idx on public.lista_compras (hogar_id, created_at);

alter table public.lista_compras enable row level security;

create policy lista_compras_select_miembro on public.lista_compras
  for select to authenticated
  using (public.es_miembro_de(hogar_id));

-- No alcanza con chequear quién la crea: tiene que ser miembro aprobado
-- del hogar destino (es_miembro_de ya exige cuenta habilitada).
create policy lista_compras_insert_miembro on public.lista_compras
  for insert to authenticated
  with check (public.es_miembro_de(hogar_id) and creado_por = auth.uid());

create policy lista_compras_update_miembro on public.lista_compras
  for update to authenticated
  using (public.es_miembro_de(hogar_id))
  with check (public.es_miembro_de(hogar_id));

create policy lista_compras_delete_miembro on public.lista_compras
  for delete to authenticated
  using (public.es_miembro_de(hogar_id));

-- Que el creador no se pueda falsear al editar.
revoke update on public.lista_compras from authenticated;
grant update (nombre, categoria, unidad, cantidad, catalogo_id, comprado) on public.lista_compras to authenticated;

-- Tiempo real: si alguien tilda o agrega algo, los demás lo ven al toque.
alter publication supabase_realtime add table public.lista_compras;

-- ---------------------------------------------------------------------------
-- 2. Comentarios de los usuarios
-- ---------------------------------------------------------------------------
create table public.comentarios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid default auth.uid() references public.usuarios(id) on delete set null,
  tipo text not null default 'idea' check (tipo in ('idea', 'problema', 'otro')),
  mensaje text not null check (char_length(btrim(mensaje)) between 3 and 2000),
  -- Contexto para entender el comentario (no identifica a nadie).
  plataforma text check (char_length(plataforma) <= 20),
  version_app text check (char_length(version_app) <= 20),
  created_at timestamptz not null default now()
);

create index comentarios_created_idx on public.comentarios (created_at desc);

alter table public.comentarios enable row level security;

-- Cada uno puede mandar comentarios a su nombre (no a nombre de otro).
create policy comentarios_insert_propio on public.comentarios
  for insert to authenticated
  with check (usuario_id = auth.uid() and public.usuario_habilitado());

-- Solo los administradores los leen (con nombre y mail, vía la función de abajo).
create policy comentarios_select_admin on public.comentarios
  for select to authenticated
  using (public.es_administrador());

create or replace function public.admin_listar_comentarios(p_limite integer default 100)
returns table (
  id uuid,
  tipo text,
  mensaje text,
  plataforma text,
  version_app text,
  created_at timestamptz,
  usuario_nombre text,
  usuario_email text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo los administradores pueden ver los comentarios';
  end if;
  return query
    select c.id, c.tipo, c.mensaje, c.plataforma, c.version_app, c.created_at, u.nombre, u.email
    from public.comentarios c
    left join public.usuarios u on u.id = c.usuario_id
    order by c.created_at desc
    limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;

revoke all on function public.admin_listar_comentarios(integer) from public, anon;
grant execute on function public.admin_listar_comentarios(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Resumen del mes de un hogar
-- ---------------------------------------------------------------------------
-- Desde `p_desde` (primer día del mes, lo manda la app con la fecha local):
--   cargados  = productos agregados (actividad 'producto_creado');
--   usados    = veces que se descontó cantidad ('producto_editado' con
--               cantidad < 0: "usé 2 huevos", el −1 de la despensa...);
--   vencidos  = productos que vencieron este mes y siguen en la despensa;
--   por_vencer_semana = vencen en los próximos 7 días.
-- La actividad se recorta a 90 días / 150 filas por hogar
-- (20261015120000_limpieza_actividad_y_notificaciones.sql): en un hogar muy
-- activo los dos primeros números pueden quedar un poco cortos.
create or replace function public.resumen_del_mes(p_hogar_id uuid, p_desde date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resultado jsonb;
begin
  if not (public.es_miembro_de(p_hogar_id) or public.es_administrador()) then
    raise exception 'No formás parte de ese hogar';
  end if;

  select jsonb_build_object(
    'cargados', (
      select count(*) from public.actividad_hogar
      where hogar_id = p_hogar_id and tipo = 'producto_creado' and created_at >= p_desde
    ),
    'usados', (
      select count(*) from public.actividad_hogar
      where hogar_id = p_hogar_id and tipo = 'producto_editado' and cantidad < 0 and created_at >= p_desde
    ),
    'vencidos', (
      select count(*) from public.productos
      where hogar_id = p_hogar_id and cantidad > 0
        and fecha_vencimiento >= p_desde and fecha_vencimiento < current_date
    ),
    'por_vencer_semana', (
      select count(*) from public.productos
      where hogar_id = p_hogar_id and cantidad > 0
        and fecha_vencimiento between current_date and current_date + 7
    )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke all on function public.resumen_del_mes(uuid, date) from public, anon;
grant execute on function public.resumen_del_mes(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Borrar mi cuenta
-- ---------------------------------------------------------------------------
-- Sale de cada hogar como "Salir del hogar" (si era dueño, el rol pasa al
-- miembro más antiguo), borra los hogares que quedan sin nadie (con sus
-- productos y su lista) y borra el usuario de Auth: por las FK en cascada se
-- van su perfil, membresías, notificaciones y tokens de push. La actividad
-- y las sugerencias del catálogo quedan sin autor (on delete set null).
create or replace function public.eliminar_mi_cuenta()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_hogar uuid;
  v_hogares uuid[];
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión para borrar tu cuenta';
  end if;

  select array_agg(hogar_id) into v_hogares
  from public.hogar_miembros where usuario_id = v_uid;

  if v_hogares is not null then
    foreach v_hogar in array v_hogares loop
      perform public.salir_de_hogar(v_hogar);
    end loop;

    -- Hogares que quedaron sin nadie. Los productos se borran ANTES que el
    -- hogar: el trigger de actividad anota cada borrado en actividad_hogar,
    -- y si el hogar ya no existiera esa fila violaría la FK (mismo problema
    -- de triggers en cascada que incidentes-sprint10.md).
    select array_agg(h.id) into v_hogares
    from public.hogares h
    where h.id = any (v_hogares)
      and not exists (select 1 from public.hogar_miembros m where m.hogar_id = h.id);

    if v_hogares is not null then
      delete from public.productos where hogar_id = any (v_hogares);
      delete from public.hogares where id = any (v_hogares);
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;
