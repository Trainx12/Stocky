-- Panel de administración (RF10 + RF9 completo) y pendientes de los términos.
-- Rama feature/panel-admin. Incluye:
--   1. Comentarios de usuarios ("Contanos qué mejorar") que leen los admins.
--   2. Registro de acciones de los administradores (quién hizo qué).
--   3. Protecciones de roles: la cuenta principal y el último admin no
--      pueden perder el rol ni ser deshabilitados.
--   4. Catálogo: los admins pueden agregar productos ya aprobados y sacar
--      productos aunque estén en uso.
--   5. Métricas para el panel (RF10).
--   6. Borrar mi cuenta.
-- (La lista de compras, las recetas y el resumen del mes siguen en pausa:
-- ver docs/mejoras-pendientes-de-activar.md.)

-- ---------------------------------------------------------------------------
-- 1. Comentarios de los usuarios
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

-- Cada uno manda comentarios a su nombre (no a nombre de otro).
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
    raise exception 'Solo los administradores pueden ver los comentarios' using errcode = '42501';
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
-- 2. Registro de acciones de los administradores
-- ---------------------------------------------------------------------------
-- Lo escriben solo los triggers de abajo (nadie puede insertar, editar ni
-- borrar a mano): así el registro es confiable. El mail del admin se guarda
-- copiado para que el registro siga legible aunque esa cuenta se borre.
create table public.admin_registro (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.usuarios(id) on delete set null,
  admin_email text,
  accion text not null,
  detalle text not null,
  created_at timestamptz not null default now()
);

create index admin_registro_created_idx on public.admin_registro (created_at desc);

alter table public.admin_registro enable row level security;

create policy admin_registro_select_admin on public.admin_registro
  for select to authenticated
  using (public.es_administrador());

revoke insert, update, delete on public.admin_registro from authenticated, anon;

create or replace function public.registrar_accion_admin(p_accion text, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.admin_registro (admin_id, admin_email, accion, detalle)
  values (auth.uid(), (select email from public.usuarios where id = auth.uid()), p_accion, p_detalle);
end;
$$;

-- Solo la usan los triggers (que corren como el dueño de la función).
revoke all on function public.registrar_accion_admin(text, text) from public, anon, authenticated;

-- Catálogo: aprobar/rechazar sugerencias, agregar, editar y sacar productos.
create or replace function public.registrar_cambio_catalogo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_administrador() then
    return null;
  end if;

  if tg_op = 'INSERT' and new.estado = 'aprobado' then
    perform public.registrar_accion_admin('catalogo_agregar',
      'Agregó "' || new.nombre || '" al catálogo (' || new.categoria || ', ' || new.unidad || ')');
  elsif tg_op = 'UPDATE' then
    if old.estado = 'pendiente' and new.estado = 'aprobado' then
      perform public.registrar_accion_admin('sugerencia_aprobar', 'Aprobó la sugerencia "' || new.nombre || '"');
    end if;
    if (old.nombre, old.categoria, old.unidad) is distinct from (new.nombre, new.categoria, new.unidad) then
      perform public.registrar_accion_admin('catalogo_editar',
        'Editó "' || old.nombre || '" (' || old.categoria || ', ' || old.unidad || ') → "'
          || new.nombre || '" (' || new.categoria || ', ' || new.unidad || ')');
    end if;
  elsif tg_op = 'DELETE' then
    if old.estado = 'pendiente' then
      perform public.registrar_accion_admin('sugerencia_rechazar', 'Rechazó la sugerencia "' || old.nombre || '"');
    else
      perform public.registrar_accion_admin('catalogo_sacar', 'Sacó "' || old.nombre || '" del catálogo');
    end if;
  end if;
  return null;
end;
$$;

create trigger registrar_cambio_catalogo
  after insert or update or delete on public.productos_catalogo
  for each row execute function public.registrar_cambio_catalogo();

-- Usuarios: cambios de rol y habilitar/deshabilitar.
create or replace function public.registrar_cambio_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_administrador() then
    return null;
  end if;
  if old.rol is distinct from new.rol then
    perform public.registrar_accion_admin('usuario_rol',
      case when new.rol = 'administrador'
        then 'Hizo administrador a ' || new.email
        else 'Le quitó el rol de administrador a ' || new.email end);
  end if;
  if old.habilitado is distinct from new.habilitado then
    perform public.registrar_accion_admin('usuario_habilitado',
      case when new.habilitado then 'Habilitó a ' || new.email else 'Deshabilitó a ' || new.email end);
  end if;
  return null;
end;
$$;

create trigger registrar_cambio_usuario
  after update of rol, habilitado on public.usuarios
  for each row execute function public.registrar_cambio_usuario();

-- ---------------------------------------------------------------------------
-- 3. Protecciones de roles
-- ---------------------------------------------------------------------------
-- Cuenta principal del proyecto: nadie (ni otro admin) puede quitarle el rol
-- ni deshabilitarla, y no se puede borrar desde la app. Para cambiarla hay
-- que editar esta función con una migración.
create or replace function public.es_cuenta_protegida(p_usuario_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = p_usuario_id and lower(email) in ('ruttyfacundo@gmail.com')
  );
$$;

revoke all on function public.es_cuenta_protegida(uuid) from public, anon;
grant execute on function public.es_cuenta_protegida(uuid) to authenticated;

-- Cuántos administradores habilitados quedarían sin contar a `p_usuario_id`.
create or replace function public.otros_admins_habilitados(p_usuario_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.usuarios
  where rol = 'administrador' and habilitado and id <> p_usuario_id;
$$;

revoke all on function public.otros_admins_habilitados(uuid) from public, anon, authenticated;

create or replace function public.proteger_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pierde_admin boolean :=
    old.rol = 'administrador' and old.habilitado
    and (new.rol <> 'administrador' or not new.habilitado);
begin
  if not v_pierde_admin then
    return new;
  end if;
  if public.es_cuenta_protegida(old.id) then
    raise exception 'La cuenta principal de Stocky (%) no puede perder el rol de administrador ni ser deshabilitada', old.email;
  end if;
  if public.otros_admins_habilitados(old.id) = 0 then
    raise exception 'No se puede: es el último administrador habilitado. Primero hacé administrador a otra cuenta';
  end if;
  return new;
end;
$$;

create trigger proteger_roles
  before update of rol, habilitado on public.usuarios
  for each row execute function public.proteger_roles();

-- ---------------------------------------------------------------------------
-- 4. Catálogo administrado
-- ---------------------------------------------------------------------------
-- Un admin puede agregar productos directamente aprobados (los usuarios
-- comunes siguen pudiendo solo sugerir, 'pendiente').
create policy productos_catalogo_insert_admin on public.productos_catalogo
  for insert to authenticated
  with check (public.es_administrador());

-- Sacar un producto del catálogo aunque haya despensas que lo usan: esos
-- productos de los hogares NO se borran, solo dejan de estar vinculados al
-- catálogo (conservan nombre, categoría y unidad).
create or replace function public.admin_sacar_del_catalogo(p_catalogo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede sacar productos del catálogo' using errcode = '42501';
  end if;
  -- Sin anotarlo en la "Actividad reciente" de cada hogar: no lo hizo
  -- nadie de la casa (ver registrar_actividad_producto abajo).
  perform set_config('stocky.sin_actividad', 'si', true);
  update public.productos set catalogo_id = null where catalogo_id = p_catalogo_id;
  perform set_config('stocky.sin_actividad', '', true);
  delete from public.productos_catalogo where id = p_catalogo_id;
  if not found then
    raise exception 'Ese producto ya no está en el catálogo';
  end if;
end;
$$;

-- Igual que la versión de 20260907130000_actividad_hogar.sql, más la marca
-- `stocky.sin_actividad` para cambios internos que no hizo nadie del hogar.
create or replace function public.registrar_actividad_producto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('stocky.sin_actividad', true) = 'si' then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'INSERT' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (NEW.hogar_id, auth.uid(), 'producto_creado', 'Se agregó "' || NEW.nombre || '"', NEW.nombre, NEW.cantidad);
    return NEW;
  elsif TG_OP = 'UPDATE' then
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (NEW.hogar_id, auth.uid(), 'producto_editado', 'Se actualizó "' || NEW.nombre || '"', NEW.nombre, NEW.cantidad - OLD.cantidad);
    return NEW;
  else
    insert into public.actividad_hogar (hogar_id, usuario_id, tipo, descripcion, producto_nombre, cantidad)
    values (OLD.hogar_id, auth.uid(), 'producto_eliminado', 'Se eliminó "' || OLD.nombre || '"', OLD.nombre, -OLD.cantidad);
    return OLD;
  end if;
end;
$$;

revoke all on function public.admin_sacar_del_catalogo(uuid) from public, anon;
grant execute on function public.admin_sacar_del_catalogo(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Métricas para el panel (RF10)
-- ---------------------------------------------------------------------------
-- Solo números agregados, sin datos personales. "Activos" = con algún
-- movimiento de productos en los últimos 30 días (actividad_hogar guarda 90
-- días / 150 filas por hogar, alcanza para esta ventana).
create or replace function public.admin_metricas()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_desde timestamptz := now() - interval '30 days';
begin
  if not public.es_administrador() then
    raise exception 'Solo los administradores pueden ver las métricas' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'usuarios_total', (select count(*) from public.usuarios),
    'usuarios_deshabilitados', (select count(*) from public.usuarios where not habilitado),
    'usuarios_nuevos_30d', (select count(*) from public.usuarios where created_at >= v_desde),
    'usuarios_activos_30d', (
      select count(distinct usuario_id) from public.actividad_hogar
      where created_at >= v_desde and usuario_id is not null
    ),
    'administradores', (select count(*) from public.usuarios where rol = 'administrador' and habilitado),
    'hogares_total', (select count(*) from public.hogares),
    'hogares_activos_30d', (select count(distinct hogar_id) from public.actividad_hogar where created_at >= v_desde),
    'productos_en_despensas', (select count(*) from public.productos),
    'productos_cargados_30d', (
      select count(*) from public.actividad_hogar where tipo = 'producto_creado' and created_at >= v_desde
    ),
    'catalogo_aprobados', (select count(*) from public.productos_catalogo where estado = 'aprobado'),
    'sugerencias_pendientes', (select count(*) from public.productos_catalogo where estado = 'pendiente'),
    'comentarios_30d', (select count(*) from public.comentarios where created_at >= v_desde)
  );
end;
$$;

revoke all on function public.admin_metricas() from public, anon;
grant execute on function public.admin_metricas() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Borrar mi cuenta
-- ---------------------------------------------------------------------------
-- Sale de cada hogar como "Salir del hogar" (si era dueño, el rol pasa al
-- miembro más antiguo), borra los hogares que quedan sin nadie y borra el
-- usuario de Auth: por las FK en cascada se van su perfil, membresías,
-- notificaciones y tokens de push. La actividad, las sugerencias, los
-- comentarios y el registro de admin quedan sin autor (on delete set null).
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
  v_vacios uuid[];
begin
  if v_uid is null then
    raise exception 'Tenés que iniciar sesión para borrar tu cuenta';
  end if;
  if public.es_cuenta_protegida(v_uid) then
    raise exception 'La cuenta principal de Stocky no se puede borrar desde la app';
  end if;
  if exists (select 1 from public.usuarios where id = v_uid and rol = 'administrador' and habilitado)
     and public.otros_admins_habilitados(v_uid) = 0 then
    raise exception 'Sos el último administrador: primero hacé administrador a otra cuenta';
  end if;

  select array_agg(hogar_id) into v_hogares
  from public.hogar_miembros where usuario_id = v_uid;

  if v_hogares is not null then
    foreach v_hogar in array v_hogares loop
      perform public.salir_de_hogar(v_hogar);
    end loop;

    -- Hogares que quedaron sin nadie. Los productos se borran ANTES que el
    -- hogar: el trigger de actividad anota cada borrado en actividad_hogar,
    -- y si el hogar ya no existiera esa fila violaría la FK.
    select array_agg(h.id) into v_vacios
    from public.hogares h
    where h.id = any (v_hogares)
      and not exists (select 1 from public.hogar_miembros m where m.hogar_id = h.id);

    if v_vacios is not null then
      delete from public.productos where hogar_id = any (v_vacios);
      delete from public.hogares where id = any (v_vacios);
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.eliminar_mi_cuenta() from public, anon;
grant execute on function public.eliminar_mi_cuenta() to authenticated;

-- Las funciones de trigger no se llaman a mano: sin permiso de ejecución
-- desde la API (los triggers igual las corren; Postgres no revisa EXECUTE
-- al dispararlos). Aplicado aparte como
-- `revocar_ejecucion_funciones_trigger_admin`.
revoke all on function public.proteger_roles() from public, anon, authenticated;
revoke all on function public.registrar_cambio_catalogo() from public, anon, authenticated;
revoke all on function public.registrar_cambio_usuario() from public, anon, authenticated;
revoke all on function public.registrar_actividad_producto() from public, anon, authenticated;
