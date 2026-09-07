-- El dueño de un hogar ahora tiene que aceptar o rechazar a quien se quiere
-- sumar por código de invitación, en vez de que "unirse_a_hogar" lo agregue
-- como miembro al toque. Se agrega un estado de "pendiente"/"aprobado" a
-- cada fila de hogar_miembros: el dueño (siempre 'aprobado', ver
-- crear_hogar) y los invitados ya aceptados quedan 'aprobado'; un invitado
-- recién sumado por código queda 'pendiente' hasta que el dueño lo revise.

create type public.estado_solicitud as enum ('pendiente', 'aprobado');

-- Default 'aprobado' a propósito: crear_hogar() sigue insertando al dueño
-- directo, sin pasar por ningún flujo de aprobación (nunca tuvo sentido
-- que el dueño se "apruebe a sí mismo"). Las filas existentes (todas ya
-- eran miembros de verdad, de antes de que existiera este concepto)
-- también quedan 'aprobado' con este mismo default.
alter table public.hogar_miembros
  add column if not exists estado public.estado_solicitud not null default 'aprobado';

-- Replica identity FULL (en vez del default, que solo manda la primary key
-- en el "old record"): HomeScreen necesita saber, al recibir un UPDATE o
-- DELETE por Realtime sobre su propia fila, cuál era el `estado` ANTES del
-- cambio -- para distinguir "me aceptaron la solicitud" (UPDATE
-- pendiente->aprobado) de "me rechazaron" (DELETE con estado pendiente) y
-- de "me expulsaron" (DELETE con estado aprobado). Tabla chica, sin
-- volumen de escritura alto, así que el costo extra de WAL es despreciable.
alter table public.hogar_miembros replica identity full;

-- ---------------------------------------------------------------------------
-- es_miembro_de() ahora exige estado = 'aprobado': mientras una solicitud
-- esté pendiente, ese usuario NO tiene que poder ver/tocar los datos del
-- hogar (productos, nombre, otros miembros) -- recién cuando el dueño la
-- aprueba pasa a ser miembro de verdad. Es la misma función que ya usan
-- las policies de hogares/productos/hogar_miembros (ver
-- 20260826130000_hogares_multi_membresia.sql), así que este único cambio
-- alcanza para cerrarles el acceso a todas esas tablas mientras esperan.
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
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and estado = 'aprobado'
  );
$$;

-- ---------------------------------------------------------------------------
-- unirse_a_hogar(): ya no suma como miembro directo -- crea la fila en
-- estado 'pendiente' y devuelve el hogar (para que la UI muestre "se envió
-- tu solicitud a <nombre>"). A propósito NO toca usuarios.hogar_id acá: ese
-- campo solo se setea cuando el dueño aprueba (ver responder_solicitud), no
-- antes -- si no, un usuario con una solicitud pendiente ya vería ese hogar
-- como "activo" sin ser miembro real todavía.
-- ---------------------------------------------------------------------------
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

  insert into public.hogar_miembros (hogar_id, usuario_id, rol, estado)
  values (v_hogar.id, auth.uid(), 'invitado', 'pendiente')
  on conflict (hogar_id, usuario_id) do nothing;

  return v_hogar;
end;
$$;

-- ---------------------------------------------------------------------------
-- responder_solicitud(): única forma de aceptar o rechazar una solicitud
-- pendiente. Mismo patrón de guarda que expulsar_miembro()/
-- permitir_editar_hogar(): solo el dueño del hogar puede llamarla.
--   - Aceptar: pasa la fila a 'aprobado' y, si el usuario todavía no tenía
--     un hogar activo, se lo asigna (mismo efecto que antes tenía
--     unirse_a_hogar() de forma inmediata).
--   - Rechazar: borra la fila -- el usuario puede volver a intentar con un
--     código (el mismo u otro) más adelante, no queda "trabado".
-- El filtro `estado = 'pendiente'` en el where evita que esto haga algo si
-- ya se había resuelto la solicitud (aprobada o rechazada) de antemano.
-- ---------------------------------------------------------------------------
create or replace function public.responder_solicitud(p_hogar_id uuid, p_usuario_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_dueno_de(p_hogar_id) then
    raise exception 'Solo el dueño del hogar puede aceptar o rechazar solicitudes';
  end if;

  if p_aprobar then
    update public.hogar_miembros
    set estado = 'aprobado'
    where hogar_id = p_hogar_id and usuario_id = p_usuario_id and estado = 'pendiente';

    update public.usuarios
    set hogar_id = p_hogar_id
    where id = p_usuario_id and hogar_id is null;
  else
    delete from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = p_usuario_id and estado = 'pendiente';
  end if;
end;
$$;

revoke execute on function public.responder_solicitud(uuid, uuid, boolean) from public;
grant execute on function public.responder_solicitud(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- listar_mis_solicitudes_pendientes(): para que quien mandó la solicitud
-- pueda ver a qué hogar(es) le está esperando respuesta al dueño, con el
-- nombre del hogar. Hace falta como RPC (SECURITY DEFINER) y no como select
-- directo porque, mientras la solicitud esté pendiente, es_miembro_de()
-- (ver arriba) da false para ese usuario -- la policy de SELECT de
-- "hogares" no lo dejaría ver el nombre del hogar todavía por su cuenta.
-- ---------------------------------------------------------------------------
create or replace function public.listar_mis_solicitudes_pendientes()
returns table (hogar_id uuid, nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.nombre, hm.created_at
  from public.hogar_miembros hm
  join public.hogares h on h.id = hm.hogar_id
  where hm.usuario_id = auth.uid() and hm.estado = 'pendiente'
  order by hm.created_at asc;
$$;

revoke execute on function public.listar_mis_solicitudes_pendientes() from public;
grant execute on function public.listar_mis_solicitudes_pendientes() to authenticated;

-- ---------------------------------------------------------------------------
-- expulsar_miembro() y permitir_editar_hogar() ya solo tenían sentido sobre
-- miembros de verdad -- se les agrega `estado = 'aprobado'` al where para
-- que sea explícito (una solicitud pendiente se resuelve con
-- responder_solicitud(), no con estas dos). No cambia ningún comportamiento
-- observable hoy porque ya excluían al dueño (rol <> 'dueno') y no había
-- forma previa de que existiera una fila 'pendiente'.
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
  where hogar_id = p_hogar_id and usuario_id = p_usuario_id and rol <> 'dueno' and estado = 'aprobado';

  update public.usuarios
  set hogar_id = (
    select hogar_id from public.hogar_miembros
    where usuario_id = p_usuario_id and estado = 'aprobado'
    order by created_at asc
    limit 1
  )
  where id = p_usuario_id and hogar_id = p_hogar_id;
end;
$$;

create or replace function public.permitir_editar_hogar(p_hogar_id uuid, p_usuario_id uuid, p_permitir boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_dueno_de(p_hogar_id) then
    raise exception 'Solo el dueño del hogar puede cambiar permisos de edición';
  end if;

  update public.hogar_miembros
  set puede_editar = p_permitir
  where hogar_id = p_hogar_id and usuario_id = p_usuario_id and rol <> 'dueno' and estado = 'aprobado';
end;
$$;
