-- ABM de usuarios para administradores (RF9 parcial, Sprint 8/9) y bloqueo
-- real de cuentas deshabilitadas.
--
-- Tres partes:
--   1. Cerrar un hueco que existía desde el Sprint 1: la policy
--      "usuarios_update_propio_o_admin" deja a cualquiera actualizar SU
--      PROPIA fila, y como `authenticated` tenía UPDATE sobre todas las
--      columnas, un usuario común podía hacerse administrador
--      (`update usuarios set rol = 'administrador' where id = auth.uid()`),
--      rehabilitarse si un admin lo deshabilitaba, o cambiar su `hogar_id`
--      al de un hogar ajeno y ver sus productos (las policies de productos
--      aceptan `hogar_id = hogar_id_actual()`). Ver
--      docs/incidentes-sprint9.md #1.
--   2. `usuarios.habilitado` existía desde el Sprint 1 pero nada lo miraba.
--      Ahora una cuenta deshabilitada no puede leer ni escribir nada: los
--      helpers de RLS devuelven false/null y un trigger frena cualquier
--      escritura, incluso las que pasan por RPCs SECURITY DEFINER.
--   3. RPCs de admin para listar usuarios, habilitar/deshabilitar y cambiar
--      el rol, con la validación del lado del servidor.

-- ---------------------------------------------------------------------------
-- 1. Nadie modifica rol/habilitado/hogar_id/email de su fila por su cuenta
-- ---------------------------------------------------------------------------

-- La app nunca hace UPDATE directo sobre usuarios (el hogar activo lo
-- cambian las RPCs crear_hogar/responder_*, que son SECURITY DEFINER y no
-- dependen de este grant). Se deja solo `nombre`, para una futura pantalla de
-- perfil; rol y habilitado se cambian únicamente con las RPCs admin_* de
-- abajo. Mismo patrón que hogar_miembros en el Sprint 2 (incidentes-sprint2 #1).
revoke update on public.usuarios from authenticated, anon;
grant update (nombre) on public.usuarios to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Cuentas deshabilitadas
-- ---------------------------------------------------------------------------

-- true si quien llama tiene la cuenta habilitada. SECURITY DEFINER con
-- search_path fijo: se usa dentro de los helpers de RLS de usuarios, y sin
-- esto la consulta a la propia tabla entra en recursión infinita
-- (incidentes-sprint1.md #7). Solo devuelve datos de quien la invoca.
create or replace function public.usuario_habilitado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select habilitado from public.usuarios where id = auth.uid()), false);
$$;

-- Los cuatro helpers que usan todas las policies y la mayoría de las RPCs
-- pasan a exigir cuenta habilitada. Con esto, una cuenta deshabilitada deja
-- de ver hogares, miembros, productos y actividad en el momento (aunque su
-- token de sesión siga vigente), y las RPCs que validan "sos dueño/miembro"
-- (expulsar, ceder, invitar, responder_solicitud, listar_actividad...) la
-- rechazan. Mismas firmas que antes: create or replace conserva los grants.
create or replace function public.es_administrador()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and rol = 'administrador' and habilitado
  );
$$;

create or replace function public.es_miembro_de(p_hogar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_habilitado() and exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and estado = 'aprobado'
  );
$$;

create or replace function public.es_dueno_de(p_hogar_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.usuario_habilitado() and exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and rol = 'dueno'
  );
$$;

create or replace function public.hogar_id_actual()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select hogar_id from public.usuarios where id = auth.uid() and habilitado;
$$;

-- Las RPCs que no pasan por esos helpers (crear_hogar, unirse_a_hogar,
-- responder_invitacion, salir_de_hogar) escriben con SECURITY DEFINER y se
-- saltean la RLS. En vez de reescribir cada una, un trigger BEFORE en las
-- tablas que escriben frena cualquier cambio hecho por una cuenta
-- deshabilitada -- los triggers corren igual dentro de una función SECURITY
-- DEFINER. `auth.uid() is null` es el SQL editor / service role (scripts y
-- migraciones): ahí no hay usuario que bloquear.
create or replace function public.bloquear_usuario_deshabilitado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.usuario_habilitado() then
    raise exception 'Tu cuenta está deshabilitada. Contactá a un administrador.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- Solo la usan los triggers, nadie la llama a mano.
revoke execute on function public.bloquear_usuario_deshabilitado() from public, anon, authenticated;

drop trigger if exists bloquear_deshabilitado on public.hogares;
create trigger bloquear_deshabilitado
  before insert or update or delete on public.hogares
  for each row execute function public.bloquear_usuario_deshabilitado();

drop trigger if exists bloquear_deshabilitado on public.hogar_miembros;
create trigger bloquear_deshabilitado
  before insert or update or delete on public.hogar_miembros
  for each row execute function public.bloquear_usuario_deshabilitado();

drop trigger if exists bloquear_deshabilitado on public.productos;
create trigger bloquear_deshabilitado
  before insert or update or delete on public.productos
  for each row execute function public.bloquear_usuario_deshabilitado();

drop trigger if exists bloquear_deshabilitado on public.productos_catalogo;
create trigger bloquear_deshabilitado
  before insert or update or delete on public.productos_catalogo
  for each row execute function public.bloquear_usuario_deshabilitado();

-- Las dos RPCs de lectura que no usan helpers: una cuenta deshabilitada
-- tampoco ve sus solicitudes/invitaciones pendientes.
create or replace function public.listar_mis_invitaciones_pendientes()
returns table(hogar_id uuid, nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.nombre, hm.created_at
  from public.hogar_miembros hm
  join public.hogares h on h.id = hm.hogar_id
  where hm.usuario_id = auth.uid() and hm.estado = 'pendiente' and hm.origen = 'invitacion'
    and public.usuario_habilitado()
  order by hm.created_at asc;
$$;

create or replace function public.listar_mis_solicitudes_pendientes()
returns table(hogar_id uuid, nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.nombre, hm.created_at
  from public.hogar_miembros hm
  join public.hogares h on h.id = hm.hogar_id
  where hm.usuario_id = auth.uid() and hm.estado = 'pendiente' and hm.origen = 'solicitud'
    and public.usuario_habilitado()
  order by hm.created_at asc;
$$;

-- La app se entera al instante si un admin la deshabilita mientras está
-- abierta (AuthContext escucha los UPDATE de su propia fila). Sin lista de
-- columnas: ver incidentes-sprint4.md #4. Realtime respeta la policy de
-- SELECT de usuarios, que siempre deja ver la fila propia.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'usuarios'
  ) then
    alter publication supabase_realtime add table public.usuarios;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. RPCs de administración
-- ---------------------------------------------------------------------------

-- Todos los usuarios de la plataforma, con cuántos hogares integra cada uno.
-- Va por RPC (y no por un select directo, que la RLS también le permitiría a
-- un admin) para que un usuario común que fuerce la pantalla reciba un error
-- claro en vez de una lista parcial con sus compañeros de hogar.
create or replace function public.admin_listar_usuarios()
returns table(
  id uuid,
  email text,
  nombre text,
  rol public.rol_usuario,
  habilitado boolean,
  created_at timestamptz,
  cantidad_hogares integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede ver la lista de usuarios' using errcode = '42501';
  end if;

  return query
    select u.id, u.email, u.nombre, u.rol, u.habilitado, u.created_at,
           (select count(*)::integer from public.hogar_miembros hm
             where hm.usuario_id = u.id and hm.estado = 'aprobado')
    from public.usuarios u
    order by u.created_at asc;
end;
$$;

-- Habilita o deshabilita una cuenta ("baja lógica": no se borra nada, así se
-- puede revertir y los productos/actividad del hogar no pierden su autor).
-- Un admin no puede deshabilitarse a sí mismo: se quedaría afuera sin forma
-- de volver a entrar desde la app.
create or replace function public.admin_set_usuario_habilitado(p_usuario_id uuid, p_habilitado boolean)
returns public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede habilitar o deshabilitar usuarios' using errcode = '42501';
  end if;
  if p_usuario_id = auth.uid() and not p_habilitado then
    raise exception 'No podés deshabilitar tu propia cuenta';
  end if;

  update public.usuarios set habilitado = p_habilitado where id = p_usuario_id
  returning * into v_usuario;

  if v_usuario.id is null then
    raise exception 'No existe ese usuario';
  end if;
  return v_usuario;
end;
$$;

-- Cambia el rol de una cuenta. Un admin no puede quitarse el rol a sí mismo
-- (mismo motivo: podría quedar la plataforma sin ningún administrador).
create or replace function public.admin_set_rol_usuario(p_usuario_id uuid, p_rol public.rol_usuario)
returns public.usuarios
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario public.usuarios;
begin
  if not public.es_administrador() then
    raise exception 'Solo un administrador puede cambiar roles' using errcode = '42501';
  end if;
  if p_usuario_id = auth.uid() and p_rol <> 'administrador' then
    raise exception 'No podés quitarte el rol de administrador a vos mismo';
  end if;

  update public.usuarios set rol = p_rol where id = p_usuario_id
  returning * into v_usuario;

  if v_usuario.id is null then
    raise exception 'No existe ese usuario';
  end if;
  return v_usuario;
end;
$$;

revoke execute on function public.admin_listar_usuarios() from public, anon;
revoke execute on function public.admin_set_usuario_habilitado(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_rol_usuario(uuid, public.rol_usuario) from public, anon;
grant execute on function public.admin_listar_usuarios() to authenticated;
grant execute on function public.admin_set_usuario_habilitado(uuid, boolean) to authenticated;
grant execute on function public.admin_set_rol_usuario(uuid, public.rol_usuario) to authenticated;
