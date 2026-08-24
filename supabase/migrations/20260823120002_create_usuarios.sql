-- Usuario y Administrador son la MISMA entidad con un campo `rol` (RF0),
-- no dos tablas separadas. `usuarios` extiende 1 a 1 a auth.users: el id
-- es el mismo que genera Supabase Auth al loguearse con Google (RF1).
create type public.rol_usuario as enum ('usuario', 'administrador');

create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  hogar_id uuid references public.hogares (id) on delete set null,
  nombre text,
  email text not null,
  rol public.rol_usuario not null default 'usuario',
  -- RF9: el admin puede deshabilitar una cuenta sin borrarla.
  habilitado boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.usuarios is 'Perfil de aplicación 1 a 1 con auth.users. El rol vive acá, no en una tabla aparte (RF0).';

-- Alta automática: cuando Supabase Auth crea una fila en auth.users (por
-- ejemplo, al completarse el login con Google), se crea el perfil
-- correspondiente en public.usuarios sin intervención del cliente. Así
-- ninguna pantalla depende de acordarse de hacer ese insert.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, email, nombre)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Es SECURITY DEFINER a propósito (necesita insertar en usuarios pese a
-- su RLS), pero eso también la vuelve invocable directamente vía
-- /rest/v1/rpc/handle_new_auth_user por cualquiera. Solo la debe llamar
-- el trigger de arriba, nunca un cliente. Postgres otorga EXECUTE a
-- PUBLIC por default al crear una función: hay que revocárselo ahí (no
-- alcanza con revocarlo de anon/authenticated, que lo heredan de PUBLIC).
revoke execute on function public.handle_new_auth_user() from public;
