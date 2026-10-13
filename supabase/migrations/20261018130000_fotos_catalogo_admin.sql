-- Fotos del catálogo administradas: un admin puede subir, cambiar o quitar
-- la foto de un producto del catálogo (Admin → Catálogo → editar).
-- Rama feature/panel-admin.

-- Los admins suben fotos al bucket de las sugerencias, en la carpeta
-- "catalogo/" (los usuarios comunes siguen pudiendo subir solo a la suya).
-- Borrar ya estaba permitido a los admins
-- (20260916120000_fotos_sugerencias.sql).
create policy catalogo_fotos_subir_admin on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catalogo-sugerencias'
    and (storage.foldername(name))[1] = 'catalogo'
    and public.es_administrador()
  );

-- La foto de un producto del catálogo solo puede ser una subida a Stocky
-- (este bucket) o ninguna: igual que en las sugerencias, no se aceptan
-- direcciones externas puestas a mano.
alter table public.productos_catalogo
  add constraint productos_catalogo_imagen_propia
  check (
    imagen_url is null
    or imagen_url like '%/storage/v1/object/public/catalogo-sugerencias/%'
  ) not valid;

-- El registro de acciones también anota los cambios de foto.
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
    if old.imagen_url is distinct from new.imagen_url and old.estado = 'aprobado' then
      perform public.registrar_accion_admin('catalogo_foto',
        case when new.imagen_url is null
          then 'Quitó la foto de "' || new.nombre || '"'
          else 'Cambió la foto de "' || new.nombre || '"' end);
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

revoke all on function public.registrar_cambio_catalogo() from public, anon, authenticated;
