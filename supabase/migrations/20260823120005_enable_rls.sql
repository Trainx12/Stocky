-- RLS habilitado desde el día uno en las tres tablas. Regla general:
-- un usuario ve/modifica lo de SU hogar (public.hogar_id_actual()); un
-- administrador (public.es_administrador()) puede ver todo, en línea con
-- RF9/RF10, aunque la UI de admin recién se construya en sprint 9.

-- ---------------------------------------------------------------------------
-- hogares
-- ---------------------------------------------------------------------------
alter table public.hogares enable row level security;

create policy "hogares_select_propio_o_admin"
  on public.hogares for select
  using (id = public.hogar_id_actual() or public.es_administrador());

-- Cualquier usuario autenticado puede crear un hogar (RF5, alta). Vincular
-- ese hogar al usuario que lo creó es responsabilidad de la app (update
-- sobre usuarios.hogar_id), cubierta por la policy de abajo.
create policy "hogares_insert_autenticado"
  on public.hogares for insert
  to authenticated
  with check (true);

create policy "hogares_update_propio_o_admin"
  on public.hogares for update
  using (id = public.hogar_id_actual() or public.es_administrador());

create policy "hogares_delete_propio_o_admin"
  on public.hogares for delete
  using (id = public.hogar_id_actual() or public.es_administrador());

-- ---------------------------------------------------------------------------
-- usuarios
-- ---------------------------------------------------------------------------
alter table public.usuarios enable row level security;

-- Un usuario ve su propia fila y las de sus compañeros de hogar (para
-- listar convivientes en RF6); un admin ve todas (RF9).
create policy "usuarios_select_propio_hogar_o_admin"
  on public.usuarios for select
  using (
    id = auth.uid()
    or hogar_id = public.hogar_id_actual()
    or public.es_administrador()
  );

-- El insert lo hace el trigger on_auth_user_created (security definer),
-- no el cliente directamente: no hace falta una policy de insert acá.

-- Un usuario solo puede editar su propia fila (p. ej. sumarse a un hogar
-- o cambiar su nombre); un admin puede editar cualquiera (RF9, habilitar
-- o deshabilitar cuentas).
create policy "usuarios_update_propio_o_admin"
  on public.usuarios for update
  using (id = auth.uid() or public.es_administrador())
  with check (id = auth.uid() or public.es_administrador());

-- ---------------------------------------------------------------------------
-- productos
-- ---------------------------------------------------------------------------
alter table public.productos enable row level security;

create policy "productos_select_propio_hogar_o_admin"
  on public.productos for select
  using (hogar_id = public.hogar_id_actual() or public.es_administrador());

create policy "productos_insert_propio_hogar"
  on public.productos for insert
  to authenticated
  with check (hogar_id = public.hogar_id_actual());

create policy "productos_update_propio_hogar_o_admin"
  on public.productos for update
  using (hogar_id = public.hogar_id_actual() or public.es_administrador())
  with check (hogar_id = public.hogar_id_actual() or public.es_administrador());

create policy "productos_delete_propio_hogar_o_admin"
  on public.productos for delete
  using (hogar_id = public.hogar_id_actual() or public.es_administrador());
