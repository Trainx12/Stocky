-- Ajuste pedido directo por el equipo: el catálogo de productos (ver
-- migración 20260909212018_catalogo_productos.sql) tiene que ser solo de
-- productos ALIMENTICIOS. "Limpieza" e "Higiene" no son comida, y
-- "Congelados" se saca a propósito (junto con "Carnes", que ya no se
-- había incluido desde el principio). Categorías finales: Lácteos,
-- Verduras y frutas, Panadería, Bebidas, Snacks, Otros.
--
-- Ningún producto de ningún hogar referenciaba todavía estas filas
-- (confirmado por SQL contra el proyecto real antes de aplicar esto), así
-- que borrarlas no deja ningún productos.catalogo_id colgando.
delete from public.productos_catalogo
where categoria in ('Limpieza', 'Higiene', 'Congelados');
