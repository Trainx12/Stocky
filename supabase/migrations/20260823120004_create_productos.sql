-- Producto pertenece a un hogar (Hogar compone Producto). El ticket OCR,
-- el audio y la foto de vencimiento son datos transitorios que se
-- procesan del lado del cliente/Edge Function y terminan siendo un
-- insert/update acá: no tienen tabla propia.
create table if not exists public.productos (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares (id) on delete cascade,
  nombre text not null,
  categoria text,
  unidad text not null default 'unidad',
  cantidad numeric not null default 0,
  stock_minimo numeric not null default 0,
  -- RF2 / RF3: la fecha es opcional y hay un flag para que el usuario
  -- desactive el seguimiento de vencimiento de ese producto puntual.
  fecha_vencimiento date,
  alerta_vencimiento_habilitada boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.productos is 'Inventario de un hogar (RF7). fecha_vencimiento y alerta_vencimiento_habilitada cubren RF2/RF3.';

-- Casi todas las queries filtran por hogar_id (RLS lo hace en cada
-- consulta), así que conviene indexarlo desde ya.
create index if not exists productos_hogar_id_idx on public.productos (hogar_id);

-- Trigger genérico: pisa updated_at con la hora actual en cada UPDATE,
-- para no tener que acordarse de setearlo a mano desde el cliente.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists productos_set_updated_at on public.productos;
create trigger productos_set_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();
