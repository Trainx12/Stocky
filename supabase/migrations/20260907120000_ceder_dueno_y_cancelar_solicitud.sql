-- Bug encontrado en QA: si el dueño de un hogar se iba (salir_de_hogar), el
-- hogar quedaba sin ningún miembro con rol 'dueno'. Como responder_solicitud,
-- expulsar_miembro y permitir_editar_hogar exigen es_dueno_de(), a partir de
-- ahí nadie podía aceptar/rechazar las solicitudes pendientes de ese hogar,
-- ni volver a resolverlas más adelante -- quedaban trabadas para siempre.

-- ---------------------------------------------------------------------------
-- ceder_dueno(): el dueño actual le pasa el rol a otro miembro YA ACEPTADO
-- de su elección (no tiene que esperar a irse para transferirlo). Mismo
-- patrón de guarda que expulsar_miembro()/responder_solicitud(): solo el
-- dueño puede llamarla, y no puede cedérselo a sí mismo. El ex-dueño queda
-- como invitado común (sin puede_editar automático -- si el nuevo dueño
-- quiere dárselo, lo hace desde "Miembros del hogar" como a cualquier otro).
-- ---------------------------------------------------------------------------
create or replace function public.ceder_dueno(p_hogar_id uuid, p_nuevo_dueno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_dueno_de(p_hogar_id) then
    raise exception 'Solo el dueño del hogar puede ceder el rol de dueño';
  end if;

  if p_nuevo_dueno_id = auth.uid() then
    raise exception 'Ya sos el dueño de este hogar';
  end if;

  if not exists (
    select 1 from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id = p_nuevo_dueno_id and estado = 'aprobado'
  ) then
    raise exception 'Ese usuario no es miembro de este hogar';
  end if;

  update public.hogar_miembros
  set rol = 'invitado'
  where hogar_id = p_hogar_id and usuario_id = auth.uid() and rol = 'dueno';

  update public.hogar_miembros
  set rol = 'dueno'
  where hogar_id = p_hogar_id and usuario_id = p_nuevo_dueno_id;
end;
$$;

revoke execute on function public.ceder_dueno(uuid, uuid) from public;
grant execute on function public.ceder_dueno(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- salir_de_hogar(): si quien se va es el dueño, antes de borrar su fila se
-- promueve a alguien más a 'dueno' -- así el hogar nunca queda sin nadie que
-- pueda resolver solicitudes/expulsiones/permisos. Orden de preferencia:
--   1. El invitado YA APROBADO más antiguo (created_at asc) -- es quien
--      lleva más tiempo siendo miembro de verdad.
--   2. Si no queda ningún invitado aprobado, la solicitud PENDIENTE más
--      antigua: se aprueba y se promueve en el mismo paso, para no dejar el
--      hogar sin dueño Y con solicitudes que nadie va a poder aceptar nunca.
-- Si tampoco hay ninguna solicitud pendiente, el hogar queda sin miembros
-- (mismo comportamiento que ya tenía antes de este cambio, sin nada nuevo
-- que resolver).
-- ---------------------------------------------------------------------------
create or replace function public.salir_de_hogar(p_hogar_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_era_dueno boolean;
  v_siguiente_dueno uuid;
  v_siguiente_hogar uuid;
begin
  select (rol = 'dueno') into v_era_dueno
  from public.hogar_miembros
  where hogar_id = p_hogar_id and usuario_id = auth.uid();

  if v_era_dueno then
    select usuario_id into v_siguiente_dueno
    from public.hogar_miembros
    where hogar_id = p_hogar_id and usuario_id <> auth.uid() and estado = 'aprobado'
    order by created_at asc
    limit 1;

    if v_siguiente_dueno is null then
      select usuario_id into v_siguiente_dueno
      from public.hogar_miembros
      where hogar_id = p_hogar_id and usuario_id <> auth.uid() and estado = 'pendiente'
      order by created_at asc
      limit 1;

      if v_siguiente_dueno is not null then
        update public.hogar_miembros
        set estado = 'aprobado'
        where hogar_id = p_hogar_id and usuario_id = v_siguiente_dueno;

        update public.usuarios
        set hogar_id = p_hogar_id
        where id = v_siguiente_dueno and hogar_id is null;
      end if;
    end if;

    if v_siguiente_dueno is not null then
      update public.hogar_miembros
      set rol = 'dueno'
      where hogar_id = p_hogar_id and usuario_id = v_siguiente_dueno;
    end if;
  end if;

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
