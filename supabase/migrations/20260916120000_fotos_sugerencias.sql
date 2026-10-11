-- Foto opcional al sugerir un producto para el catálogo. Se guarda en un
-- bucket público (la app la muestra por URL, igual que imagen_url del
-- catálogo) y cada usuario solo puede subir dentro de su propia carpeta
-- (<auth.uid()>/archivo.jpg). Al aprobarse la sugerencia, esa URL pasa a ser
-- la foto del producto; al rechazarse, el admin la borra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalogo-sugerencias', 'catalogo-sugerencias', true, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

create policy "catalogo_sugerencias_subir_propia"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'catalogo-sugerencias'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Borrar (y el select que Storage exige para poder borrar): la propia foto
-- (si falla la sugerencia después de subirla) o cualquiera si es admin
-- (al rechazar).
create policy "catalogo_sugerencias_ver_propia_o_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'catalogo-sugerencias'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
);

create policy "catalogo_sugerencias_borrar_propia_o_admin"
on storage.objects for delete to authenticated
using (
  bucket_id = 'catalogo-sugerencias'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.es_administrador())
);

-- La sugerencia solo puede traer una foto subida por quien sugiere a este
-- bucket: nada de enlaces a sitios externos en el catálogo.
drop policy if exists "productos_catalogo_insert_propio_pendiente" on public.productos_catalogo;
create policy "productos_catalogo_insert_propio_pendiente"
on public.productos_catalogo for insert to authenticated
with check (
  sugerido_por = auth.uid()
  and estado = 'pendiente'
  and (
    imagen_url is null
    or imagen_url like '%/storage/v1/object/public/catalogo-sugerencias/' || auth.uid()::text || '/%'
  )
);
