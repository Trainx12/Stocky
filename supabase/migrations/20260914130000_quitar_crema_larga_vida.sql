-- Pedido del equipo: "Crema de Leche Larga Vida" sobra en el catálogo (queda
-- "Crema de Leche"). Ningún producto de ningún hogar lo referenciaba
-- (verificado por SQL antes de aplicarlo), así que borrarlo no deja ningún
-- productos.catalogo_id colgando.
delete from public.productos_catalogo
where nombre = 'Crema de Leche Larga Vida'
  and not exists (
    select 1 from public.productos p where p.catalogo_id = productos_catalogo.id
  );
