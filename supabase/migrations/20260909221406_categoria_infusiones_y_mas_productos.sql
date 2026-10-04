-- Pedido directo del equipo: una categoría "Infusiones" separada de
-- "Bebidas" (café, yerba mate, té y afines no son lo mismo que una gaseosa
-- para el usuario que arma la lista de compras), y más productos
-- alimenticios en el catálogo en general.

-- Mueve los que ya existían en "Bebidas" y en realidad son infusiones.
update public.productos_catalogo
set categoria = 'Infusiones'
where nombre in ('Café', 'Yerba Mate', 'Té');

-- Suma productos nuevos, ya aprobados (mismo criterio que la semilla
-- original: cargados con la app, no sugeridos por un usuario puntual).
-- imagen_url queda null acá -- se completa en la migración siguiente con
-- URLs reales de Open Food Facts.
insert into public.productos_catalogo (nombre, categoria, unidad, estado) values
  -- Infusiones (nuevas, además de las movidas arriba)
  ('Mate Cocido', 'Infusiones', 'paquete', 'aprobado'),
  ('Café Instantáneo', 'Infusiones', 'g', 'aprobado'),
  ('Manzanilla', 'Infusiones', 'paquete', 'aprobado'),
  -- Lácteos
  ('Ricota', 'Lácteos', 'g', 'aprobado'),
  ('Leche Chocolatada', 'Lácteos', 'l', 'aprobado'),
  ('Postre Lácteo', 'Lácteos', 'unidad', 'aprobado'),
  -- Verduras y frutas
  ('Batata', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Choclo', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Pepino', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Frutilla', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Uva', 'Verduras y frutas', 'kg', 'aprobado'),
  -- Panadería
  ('Medialunas', 'Panadería', 'unidad', 'aprobado'),
  ('Pan de Salvado', 'Panadería', 'kg', 'aprobado'),
  ('Grisines', 'Panadería', 'paquete', 'aprobado'),
  -- Bebidas
  ('Agua Saborizada', 'Bebidas', 'l', 'aprobado'),
  ('Soda', 'Bebidas', 'l', 'aprobado'),
  -- Snacks
  ('Barrita de Cereal', 'Snacks', 'unidad', 'aprobado'),
  ('Caramelos', 'Snacks', 'paquete', 'aprobado'),
  ('Palitos Salados', 'Snacks', 'paquete', 'aprobado'),
  -- Otros
  ('Avena', 'Otros', 'g', 'aprobado'),
  ('Copos de Maíz', 'Otros', 'g', 'aprobado'),
  ('Gelatina', 'Otros', 'unidad', 'aprobado'),
  ('Caldo en Cubos', 'Otros', 'unidad', 'aprobado'),
  ('Miel', 'Otros', 'g', 'aprobado');
