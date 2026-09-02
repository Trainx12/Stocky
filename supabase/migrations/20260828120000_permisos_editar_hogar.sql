-- Hasta ahora CUALQUIER miembro de un hogar (dueño o invitado) podía
-- renombrarlo -- la policy de UPDATE de "hogares" solo pedía "sos
-- miembro", sin distinguir jerarquía. Esta migración restringe editar el
-- nombre al dueño por default, y le agrega al dueño la posibilidad de
-- habilitar esa edición para un invitado puntual.

-- ---------------------------------------------------------------------------
-- Nueva columna: si ese invitado puede editar el nombre del hogar. Default
-- false a propósito -- el dueño tiene que habilitarlo explícitamente,
-- nunca es el comportamiento por default. No aplica al dueño (que
-- siempre puede editar vía es_dueno_de(), sin importar este valor).
-- ---------------------------------------------------------------------------
alter table public.hogar_miembros
  add column if not exists puede_editar boolean not null default false;

-- No hay policy de UPDATE para hogar_miembros (el único cambio permitido a
-- esta tabla es puede_editar, y eso pasa por la RPC de abajo, no por
-- .update() directo) -- se revoca a nivel tabla para que quede explícito,
-- mismo patrón que ya se usa con INSERT en esta tabla.
revoke update on public.hogar_miembros from authenticated, anon;

-- ---------------------------------------------------------------------------
-- permitir_editar_hogar(): la única forma de cambiar puede_editar. Solo el
-- dueño puede llamarla, y nunca sobre la fila del propio dueño (no tiene
-- sentido: el dueño ya puede editar siempre, vía es_dueno_de()).
-- ---------------------------------------------------------------------------
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
  where hogar_id = p_hogar_id and usuario_id = p_usuario_id and rol <> 'dueno';
end;
$$;

revoke execute on function public.permitir_editar_hogar(uuid, uuid, boolean) from public;
grant execute on function public.permitir_editar_hogar(uuid, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Se restringe la policy de UPDATE de "hogares": antes alcanzaba con
-- es_miembro_de() (cualquier invitado podía renombrar) -- ahora hace falta
-- ser dueño, o ser miembro con puede_editar = true, o admin.
-- ---------------------------------------------------------------------------
drop policy if exists "hogares_update_propio_o_miembro_o_admin" on public.hogares;
create policy "hogares_update_dueno_o_permitido_o_admin"
  on public.hogares for update
  using (
    public.es_dueno_de(id)
    or exists (
      select 1 from public.hogar_miembros
      where hogar_id = hogares.id and usuario_id = auth.uid() and puede_editar = true
    )
    or public.es_administrador()
  );

-- ---------------------------------------------------------------------------
-- Realtime en hogar_miembros: para que, al expulsar a alguien, ESE usuario
-- se entere al instante en su propia sesión (no solo quien lo expulsó, que
-- ya ve el cambio porque es su propia acción). Sin esto, el expulsado
-- seguía viendo el hogar en su pantalla hasta que recargara a mano.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.hogar_miembros;
