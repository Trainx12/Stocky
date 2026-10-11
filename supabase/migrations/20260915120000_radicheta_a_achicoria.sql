-- Pedido del equipo: el producto del catálogo "Radicheta" pasa a llamarse
-- "Achicoria". Los productos de los hogares que lo usen copian el nombre del
-- catálogo al crearse, así que se renombran también para que la lista no
-- muestre un nombre viejo (al aplicarlo no había ninguno).
update public.productos
set nombre = 'Achicoria'
where nombre = 'Radicheta'
  and catalogo_id in (select id from public.productos_catalogo where nombre = 'Radicheta');

update public.productos_catalogo
set nombre = 'Achicoria'
where nombre = 'Radicheta'
  and not exists (select 1 from public.productos_catalogo where nombre = 'Achicoria');
