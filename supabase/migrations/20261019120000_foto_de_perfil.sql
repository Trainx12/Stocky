-- Foto de perfil: cada usuario puede subir, cambiar o quitar su foto desde
-- Cuenta. Se ve en el saludo del inicio, en "Miembros del hogar" y en
-- Admin → Usuarios. Rama feature/foto-perfil.

-- 1. Columna con la URL pública de la foto (null = sin foto: la app muestra
--    la inicial). Solo puede ser una foto subida por el propio usuario a su
--    carpeta del bucket "avatares": nada de enlaces a sitios externos.
alter table public.usuarios add column if not exists avatar_url text;

alter table public.usuarios
  add constraint usuarios_avatar_propio
  check (
    avatar_url is null
    or avatar_url like '%/storage/v1/object/public/avatares/' || id::text || '/%'
  );

-- Desde 20261011120000_abm_usuarios_y_habilitado.sql el cliente solo puede
-- actualizar columnas puntuales de usuarios (nombre, dias_aviso_vencimiento).
grant update (avatar_url) on public.usuarios to authenticated;

-- 2. Bucket público (la app muestra la foto por URL, igual que el catálogo).
--    Fotos chicas en JPEG: la app las achica a 400 px antes de subirlas.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatares', 'avatares', true, 524288, array['image/jpeg'])
on conflict (id) do nothing;

-- Cada usuario sube, ve (Storage lo exige para listar y borrar) y borra solo
-- dentro de su carpeta: avatares/<auth.uid()>/archivo.jpg.
create policy "avatares_subir_propio"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatares_ver_propio"
on storage.objects for select to authenticated
using (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatares_borrar_propio"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatares'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Admin → Usuarios también muestra la foto. Cambia el tipo de retorno, así
--    que hay que borrar la función y volver a darle los permisos.
drop function if exists public.admin_listar_usuarios();

create function public.admin_listar_usuarios()
returns table(
  id uuid,
  email text,
  nombre text,
  rol public.rol_usuario,
  habilitado boolean,
  created_at timestamptz,
  cantidad_hogares integer,
  avatar_url text
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
             where hm.usuario_id = u.id and hm.estado = 'aprobado'),
           u.avatar_url
    from public.usuarios u
    order by u.created_at asc;
end;
$$;

revoke execute on function public.admin_listar_usuarios() from public, anon;
grant execute on function public.admin_listar_usuarios() to authenticated;

-- Al borrar la cuenta (eliminar_mi_cuenta) la foto se borra desde la app
-- ANTES de llamar a la RPC (services/auth.eliminarMiCuenta): Supabase no deja
-- borrar archivos de Storage con SQL directo sobre storage.objects.
