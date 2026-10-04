-- El dueño de un hogar ahora puede invitar directamente a alguien por su
-- mail, en vez de depender de que la otra persona tenga el código y pida
-- unirse. Reusa la misma tabla hogar_miembros / estado 'pendiente' que ya
-- usa "unirse_a_hogar" (ver migración 20260903120000_solicitudes_hogar.sql),
-- pero hace falta distinguir quién tiene que responder cada fila pendiente:
--   - origen 'solicitud' (ya existía, default): alguien pidió sumarse por
--     código, y el DUEÑO decide (responder_solicitud).
--   - origen 'invitacion' (nueva): el DUEÑO invitó a alguien puntual, y es
--     esa PERSONA quien decide (responder_invitacion, más abajo).
-- Sin esta columna, una invitación del dueño aparecería mezclada con "sus
-- propias" solicitudes a resolver, y la persona invitada no tendría ninguna
-- forma de distinguir "pedí unirme" de "me invitaron".
--
-- Limitación conocida de esta versión: solo funciona si el mail invitado
-- YA tiene una cuenta creada en Stocky -- no manda ningún correo real a
-- alguien sin cuenta. Mandar un mail de verdad requeriría una Edge Function
-- + un proveedor externo (Resend, etc.), fuera de este alcance.

create type public.origen_membresia as enum ('solicitud', 'invitacion');

alter table public.hogar_miembros
  add column if not exists origen public.origen_membresia not null default 'solicitud';

-- ---------------------------------------------------------------------------
-- listar_mis_solicitudes_pendientes() ya filtraba por estado='pendiente';
-- ahora hace falta además filtrar por origen para no mezclar los dos
-- flujos: acá solo van las que YO mandé pidiendo unirme. Las que me
-- mandaron a mí van por listar_mis_invitaciones_pendientes(), más abajo.
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
  where hm.usuario_id = auth.uid() and hm.estado = 'pendiente' and hm.origen = 'solicitud'
  order by hm.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- invitar_a_hogar(): el dueño manda una invitación a un mail puntual.
-- Mismo patrón de guarda que responder_solicitud()/expulsar_miembro(): solo
-- el dueño del hogar puede llamarla. Si el mail no tiene cuenta en Stocky,
-- se le avisa al dueño con una excepción legible en vez de fallar en
-- silencio (ver limitación conocida arriba).
-- ---------------------------------------------------------------------------
create or replace function public.invitar_a_hogar(p_hogar_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not public.es_dueno_de(p_hogar_id) then
    raise exception 'Solo el dueño del hogar puede invitar miembros';
  end if;

  select id into v_usuario_id from public.usuarios where lower(email) = lower(trim(p_email));

  if v_usuario_id is null then
    raise exception 'No hay ninguna cuenta de Stocky registrada con ese mail';
  end if;

  if v_usuario_id = auth.uid() then
    raise exception 'No podés invitarte a vos mismo';
  end if;

  if exists (select 1 from public.hogar_miembros where hogar_id = p_hogar_id and usuario_id = v_usuario_id) then
    raise exception 'Esa persona ya es miembro de este hogar o ya tiene una solicitud/invitación pendiente';
  end if;

  insert into public.hogar_miembros (hogar_id, usuario_id, rol, estado, origen)
  values (p_hogar_id, v_usuario_id, 'invitado', 'pendiente', 'invitacion');
end;
$$;

revoke execute on function public.invitar_a_hogar(uuid, text) from public;
grant execute on function public.invitar_a_hogar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- responder_invitacion(): a diferencia de responder_solicitud() (que la
-- llama el DUEÑO sobre la fila de otro), esta la llama la propia PERSONA
-- INVITADA sobre su propia fila -- por eso valida usuario_id = auth.uid()
-- en el where en vez de es_dueno_de(). Mismo efecto que responder_solicitud
-- al aceptar/rechazar (aprobar asigna hogar activo si no tenía; rechazar
-- borra la fila sin dejar rastro).
-- ---------------------------------------------------------------------------
create or replace function public.responder_invitacion(p_hogar_id uuid, p_aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_aprobar then
    update public.hogar_miembros
    set estado = 'aprobado'
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and estado = 'pendiente' and origen = 'invitacion';

    update public.usuarios
    set hogar_id = p_hogar_id
    where id = auth.uid() and hogar_id is null;
  else
    delete from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = auth.uid() and estado = 'pendiente' and origen = 'invitacion';
  end if;
end;
$$;

revoke execute on function public.responder_invitacion(uuid, boolean) from public;
grant execute on function public.responder_invitacion(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- listar_mis_invitaciones_pendientes(): para que la persona invitada vea a
-- qué hogar(es) la invitaron y pueda aceptar/rechazar. Va por RPC
-- (SECURITY DEFINER) y no por select directo por el mismo motivo que
-- listar_mis_solicitudes_pendientes(): mientras la fila esté 'pendiente',
-- es_miembro_de() da false para ese usuario, así que la policy de SELECT de
-- "hogares" no lo dejaría ver el nombre del hogar todavía por su cuenta.
-- ---------------------------------------------------------------------------
create or replace function public.listar_mis_invitaciones_pendientes()
returns table (hogar_id uuid, nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.nombre, hm.created_at
  from public.hogar_miembros hm
  join public.hogares h on h.id = hm.hogar_id
  where hm.usuario_id = auth.uid() and hm.estado = 'pendiente' and hm.origen = 'invitacion'
  order by hm.created_at asc;
$$;

revoke execute on function public.listar_mis_invitaciones_pendientes() from public;
grant execute on function public.listar_mis_invitaciones_pendientes() to authenticated;
