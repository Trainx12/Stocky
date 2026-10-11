-- Marca opcional por producto, para poder distinguir "Fideos Lucchetti" de
-- "Fideos Matarazzo" (cada uno con su propio vencimiento) sin ensanchar el
-- catálogo global: el catálogo sigue teniendo UNA fila "Fideos", la marca es
-- texto libre en la fila del hogar. Nullable: los productos existentes no
-- tienen marca y no hace falta migrarlos.
alter table public.productos add column marca text;

alter table public.productos
  add constraint productos_marca_largo check (marca is null or char_length(marca) <= 40);

-- ajustar_cantidad_producto() recibía el delta como int (alcanzaba para el
-- +1/-1 de los botones), pero `productos.cantidad` es numeric y al unir un
-- producto duplicado hay que poder sumar cantidades decimales (0.5 kg).
-- Cambiar el tipo del parámetro crea una función distinta en Postgres, así
-- que se borra la anterior en vez de dejar las dos sobrecargadas.
drop function if exists public.ajustar_cantidad_producto(uuid, int);

create or replace function public.ajustar_cantidad_producto(p_producto_id uuid, p_delta numeric)
returns public.productos
language plpgsql
set search_path = public
as $$
declare
  v_producto public.productos;
begin
  update public.productos
  set cantidad = greatest(cantidad + p_delta, 0)
  where id = p_producto_id
  returning * into v_producto;

  if v_producto.id is null then
    raise exception 'No se encontró el producto (o no pertenece a tu hogar activo)';
  end if;

  return v_producto;
end;
$$;

revoke execute on function public.ajustar_cantidad_producto(uuid, numeric) from public;
grant execute on function public.ajustar_cantidad_producto(uuid, numeric) to authenticated;
