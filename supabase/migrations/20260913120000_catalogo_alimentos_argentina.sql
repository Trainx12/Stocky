-- Amplía el catálogo global con (1) alimentos que aparecieron al probar el
-- escaneo de tickets reales y no estaban ("Flan", "Leche en Polvo", "Pasta
-- para Sopa", "Porotos", "Aceite de Oliva", "Canela", "Pochoclo", etc.) y
-- (2) alimentos y marcas de góndola comunes en Argentina.
--
-- Se respeta lo ya decidido (ver 20260909214924_catalogo_solo_alimenticios):
-- NADA de carnes, fiambres, congelados ni productos que no sean comida. Todo
-- lo que se agrega tiene vencimiento impreso en el envase o es perecedero
-- de corta duración (frutas, verduras, pan). Tampoco se agrega pescado
-- enlatado (atún, caballa) por si cuenta como "carne" para el equipo.
--
-- `on conflict (lower(nombre)) do nothing`: el catálogo tiene un índice único
-- sobre el nombre en minúsculas, así que si alguno ya existe se saltea en vez
-- de romper la migración.
insert into public.productos_catalogo (nombre, categoria, unidad, estado) values
  -- Lácteos
  ('Flan', 'Lácteos', 'unidad', 'aprobado'),
  ('Leche en Polvo', 'Lácteos', 'g', 'aprobado'),
  ('Queso Crema', 'Lácteos', 'g', 'aprobado'),
  ('Queso Untable', 'Lácteos', 'g', 'aprobado'),
  ('Yogur Bebible', 'Lácteos', 'l', 'aprobado'),
  ('Leche Descremada', 'Lácteos', 'l', 'aprobado'),
  ('Crema de Leche Larga Vida', 'Lácteos', 'ml', 'aprobado'),

  -- Verduras y frutas
  ('Berenjena', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Brócoli', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Coliflor', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Repollo', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Espinaca', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Acelga', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Rúcula', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Remolacha', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Zapallito', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Pimiento', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Cebolla de Verdeo', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Puerro', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Apio', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Champiñones', 'Verduras y frutas', 'g', 'aprobado'),
  ('Perejil', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Mandarina', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Pomelo', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Pera', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Durazno', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Ciruela', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Kiwi', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Ananá', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Sandía', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Melón', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Cereza', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Arándanos', 'Verduras y frutas', 'g', 'aprobado'),

  -- Panadería
  ('Pan Baguette', 'Panadería', 'unidad', 'aprobado'),
  ('Pan de Hamburguesa', 'Panadería', 'paquete', 'aprobado'),
  ('Pan para Panchos', 'Panadería', 'paquete', 'aprobado'),
  ('Prepizza', 'Panadería', 'unidad', 'aprobado'),
  ('Tapas de Empanadas', 'Panadería', 'paquete', 'aprobado'),
  ('Tapas de Tarta', 'Panadería', 'paquete', 'aprobado'),
  ('Vainillas', 'Panadería', 'paquete', 'aprobado'),
  ('Bizcochos', 'Panadería', 'paquete', 'aprobado'),
  ('Galletitas Saladas', 'Panadería', 'paquete', 'aprobado'),
  ('Pan Rallado', 'Panadería', 'g', 'aprobado'),

  -- Bebidas
  ('Jugo Envasado', 'Bebidas', 'l', 'aprobado'),
  ('Jugo en Polvo', 'Bebidas', 'unidad', 'aprobado'),
  ('Gaseosa Lima Limón', 'Bebidas', 'l', 'aprobado'),
  ('Gaseosa Naranja', 'Bebidas', 'l', 'aprobado'),
  ('Gaseosa Sin Azúcar', 'Bebidas', 'l', 'aprobado'),
  ('Agua con Gas', 'Bebidas', 'l', 'aprobado'),
  ('Fernet', 'Bebidas', 'unidad', 'aprobado'),
  ('Sidra', 'Bebidas', 'unidad', 'aprobado'),

  -- Infusiones
  ('Cacao en Polvo', 'Infusiones', 'g', 'aprobado'),
  ('Té Verde', 'Infusiones', 'paquete', 'aprobado'),
  ('Yerba Mate con Hierbas', 'Infusiones', 'kg', 'aprobado'),

  -- Snacks
  ('Pochoclo', 'Snacks', 'paquete', 'aprobado'),
  ('Chizitos', 'Snacks', 'paquete', 'aprobado'),
  ('Frutos Secos', 'Snacks', 'g', 'aprobado'),
  ('Pasas de Uva', 'Snacks', 'g', 'aprobado'),
  ('Galletitas Rellenas', 'Snacks', 'paquete', 'aprobado'),
  ('Gomitas', 'Snacks', 'paquete', 'aprobado'),
  ('Chicles', 'Snacks', 'paquete', 'aprobado'),
  ('Mantecol', 'Snacks', 'unidad', 'aprobado'),
  ('Garrapiñada', 'Snacks', 'g', 'aprobado'),

  -- Otros (almacén)
  ('Aceite de Oliva', 'Otros', 'l', 'aprobado'),
  ('Aceite de Girasol', 'Otros', 'l', 'aprobado'),
  ('Pasta para Sopa', 'Otros', 'paquete', 'aprobado'),
  ('Ñoquis Secos', 'Otros', 'paquete', 'aprobado'),
  ('Porotos', 'Otros', 'kg', 'aprobado'),
  ('Garbanzos', 'Otros', 'kg', 'aprobado'),
  ('Arvejas', 'Otros', 'unidad', 'aprobado'),
  ('Choclo en Lata', 'Otros', 'unidad', 'aprobado'),
  ('Tomate Triturado', 'Otros', 'unidad', 'aprobado'),
  ('Salsa de Tomate', 'Otros', 'unidad', 'aprobado'),
  ('Salsa Golf', 'Otros', 'g', 'aprobado'),
  ('Salsa de Soja', 'Otros', 'ml', 'aprobado'),
  ('Aceitunas', 'Otros', 'g', 'aprobado'),
  ('Canela', 'Otros', 'g', 'aprobado'),
  ('Pimienta Negra', 'Otros', 'g', 'aprobado'),
  ('Orégano', 'Otros', 'g', 'aprobado'),
  ('Pimentón', 'Otros', 'g', 'aprobado'),
  ('Ají Molido', 'Otros', 'g', 'aprobado'),
  ('Comino', 'Otros', 'g', 'aprobado'),
  ('Maicena', 'Otros', 'g', 'aprobado'),
  ('Levadura', 'Otros', 'g', 'aprobado'),
  ('Polvo de Hornear', 'Otros', 'g', 'aprobado'),
  ('Esencia de Vainilla', 'Otros', 'ml', 'aprobado'),
  ('Premezcla para Panqueques', 'Otros', 'paquete', 'aprobado'),
  ('Premezcla para Bizcochuelo', 'Otros', 'paquete', 'aprobado'),
  ('Mermelada', 'Otros', 'g', 'aprobado'),
  ('Dulce de Membrillo', 'Otros', 'g', 'aprobado'),
  ('Dulce de Batata', 'Otros', 'g', 'aprobado'),
  ('Edulcorante', 'Otros', 'unidad', 'aprobado'),
  ('Granola', 'Otros', 'g', 'aprobado'),
  ('Quinoa', 'Otros', 'g', 'aprobado'),
  ('Sopa Instantánea', 'Otros', 'unidad', 'aprobado'),
  ('Puré Instantáneo', 'Otros', 'paquete', 'aprobado')
on conflict (lower(nombre)) do nothing;
