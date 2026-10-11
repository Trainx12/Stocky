-- Segunda ampliación del catálogo con alimentos de uso cotidiano que todavía
-- no estaban (pastas por tipo, quesos de góndola, hierbas y verduras de hoja,
-- frutas de estación, semillas y frutos secos, especias, enlatados y
-- panificados). Mismas reglas que 20260913120000_catalogo_alimentos_argentina:
-- nada de carnes, fiambres, congelados, pescado enlatado ni productos que no
-- sean comida, y se saltea lo que ya exista (`on conflict`, índice único sobre
-- lower(nombre)).
insert into public.productos_catalogo (nombre, categoria, unidad, estado) values
  -- Lácteos
  ('Muzzarella', 'Lácteos', 'g', 'aprobado'),
  ('Queso Port Salut', 'Lácteos', 'g', 'aprobado'),
  ('Leche Condensada', 'Lácteos', 'g', 'aprobado'),
  ('Crema Chantilly', 'Lácteos', 'ml', 'aprobado'),
  ('Yogur Griego', 'Lácteos', 'unidad', 'aprobado'),
  ('Leche de Almendras', 'Lácteos', 'l', 'aprobado'),
  ('Leche de Soja', 'Lácteos', 'l', 'aprobado'),

  -- Verduras y frutas
  ('Chaucha', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Hinojo', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Rabanito', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Jengibre', 'Verduras y frutas', 'g', 'aprobado'),
  ('Albahaca', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Cilantro', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Menta', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Cebolla Morada', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Tomate Cherry', 'Verduras y frutas', 'g', 'aprobado'),
  ('Radicheta', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Mix de Hojas Verdes', 'Verduras y frutas', 'paquete', 'aprobado'),
  ('Mango', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Damasco', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Granada', 'Verduras y frutas', 'unidad', 'aprobado'),
  ('Frambuesa', 'Verduras y frutas', 'g', 'aprobado'),
  ('Higo', 'Verduras y frutas', 'kg', 'aprobado'),
  ('Lima', 'Verduras y frutas', 'kg', 'aprobado'),

  -- Panadería
  ('Pan Árabe', 'Panadería', 'paquete', 'aprobado'),
  ('Pan de Miga', 'Panadería', 'paquete', 'aprobado'),
  ('Pan Integral', 'Panadería', 'paquete', 'aprobado'),
  ('Tortillas', 'Panadería', 'paquete', 'aprobado'),
  ('Budín', 'Panadería', 'unidad', 'aprobado'),
  ('Magdalenas', 'Panadería', 'paquete', 'aprobado'),
  ('Galletitas Integrales', 'Panadería', 'paquete', 'aprobado'),
  ('Galletas de Arroz', 'Panadería', 'paquete', 'aprobado'),
  ('Rebozador', 'Panadería', 'g', 'aprobado'),

  -- Bebidas
  ('Agua Tónica', 'Bebidas', 'l', 'aprobado'),
  ('Bebida Isotónica', 'Bebidas', 'l', 'aprobado'),
  ('Energizante', 'Bebidas', 'unidad', 'aprobado'),
  ('Gaseosa Pomelo', 'Bebidas', 'l', 'aprobado'),
  ('Espumante', 'Bebidas', 'unidad', 'aprobado'),
  ('Aperitivo', 'Bebidas', 'unidad', 'aprobado'),
  ('Vino Tinto', 'Bebidas', 'unidad', 'aprobado'),
  ('Vino Blanco', 'Bebidas', 'unidad', 'aprobado'),

  -- Infusiones
  ('Té Negro', 'Infusiones', 'paquete', 'aprobado'),
  ('Boldo', 'Infusiones', 'paquete', 'aprobado'),
  ('Tilo', 'Infusiones', 'paquete', 'aprobado'),
  ('Café en Cápsulas', 'Infusiones', 'paquete', 'aprobado'),

  -- Snacks
  ('Almendras', 'Snacks', 'g', 'aprobado'),
  ('Nueces', 'Snacks', 'g', 'aprobado'),
  ('Castañas de Cajú', 'Snacks', 'g', 'aprobado'),
  ('Semillas de Chía', 'Snacks', 'g', 'aprobado'),
  ('Semillas de Lino', 'Snacks', 'g', 'aprobado'),
  ('Semillas de Girasol', 'Snacks', 'g', 'aprobado'),
  ('Nachos', 'Snacks', 'paquete', 'aprobado'),
  ('Bombones', 'Snacks', 'paquete', 'aprobado'),
  ('Obleas', 'Snacks', 'paquete', 'aprobado'),

  -- Otros (almacén)
  ('Spaghetti', 'Otros', 'paquete', 'aprobado'),
  ('Tallarines', 'Otros', 'paquete', 'aprobado'),
  ('Fideos Guiseros', 'Otros', 'paquete', 'aprobado'),
  ('Ravioles', 'Otros', 'paquete', 'aprobado'),
  ('Tapas de Lasaña', 'Otros', 'paquete', 'aprobado'),
  ('Arroz Integral', 'Otros', 'kg', 'aprobado'),
  ('Cuscús', 'Otros', 'g', 'aprobado'),
  ('Arvejas Partidas', 'Otros', 'g', 'aprobado'),
  ('Sal Gruesa', 'Otros', 'kg', 'aprobado'),
  ('Azúcar Impalpable', 'Otros', 'kg', 'aprobado'),
  ('Azúcar Mascabo', 'Otros', 'kg', 'aprobado'),
  ('Harina Integral', 'Otros', 'kg', 'aprobado'),
  ('Harina Leudante', 'Otros', 'kg', 'aprobado'),
  ('Fécula de Mandioca', 'Otros', 'g', 'aprobado'),
  ('Coco Rallado', 'Otros', 'g', 'aprobado'),
  ('Crema de Maní', 'Otros', 'g', 'aprobado'),
  ('Chocolate Cobertura', 'Otros', 'g', 'aprobado'),
  ('Premezcla para Pizza', 'Otros', 'paquete', 'aprobado'),
  ('Salsa Barbacoa', 'Otros', 'g', 'aprobado'),
  ('Chimichurri', 'Otros', 'g', 'aprobado'),
  ('Aceto Balsámico', 'Otros', 'ml', 'aprobado'),
  ('Pepinillos', 'Otros', 'g', 'aprobado'),
  ('Morrones en Lata', 'Otros', 'unidad', 'aprobado'),
  ('Palmitos', 'Otros', 'unidad', 'aprobado'),
  ('Durazno en Almíbar', 'Otros', 'unidad', 'aprobado'),
  ('Ananá en Almíbar', 'Otros', 'unidad', 'aprobado'),
  ('Leche de Coco', 'Otros', 'ml', 'aprobado'),
  ('Provenzal', 'Otros', 'g', 'aprobado'),
  ('Laurel', 'Otros', 'g', 'aprobado'),
  ('Nuez Moscada', 'Otros', 'g', 'aprobado'),
  ('Curry', 'Otros', 'g', 'aprobado'),
  ('Bicarbonato de Sodio', 'Otros', 'g', 'aprobado'),
  ('Gelatina sin Sabor', 'Otros', 'g', 'aprobado')
on conflict (lower(nombre)) do nothing;
