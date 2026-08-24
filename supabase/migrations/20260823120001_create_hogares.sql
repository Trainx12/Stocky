-- Hogar: entidad raíz del inventario compartido (RF5). Se crea antes que
-- "usuarios" porque usuarios.hogar_id la referencia.
create extension if not exists pgcrypto;

create table if not exists public.hogares (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  created_at timestamptz not null default now()
);

comment on table public.hogares is 'Un hogar agrupa a los usuarios que comparten un mismo inventario de productos (RF5).';
