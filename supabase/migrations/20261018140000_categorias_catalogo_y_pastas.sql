-- Reorganización del catálogo (pedido de Facundo, 2026-10-13): "Otros"
-- tenía 84 de los 257 productos y filtrar por categoría servía poco. Se
-- reparte en categorías nuevas y se suman los tipos de pasta que faltaban.
-- Solo cambia el catálogo (lo que se ve al cargar): los productos que ya
-- están en las despensas conservan la categoría con la que se cargaron.
-- Rama feature/panel-admin.

-- Pastas
update public.productos_catalogo set categoria = 'Pastas'
where nombre in ('Fideos', 'Fideos Guiseros', 'Spaghetti', 'Tallarines', 'Ñoquis Secos', 'Ravioles',
                 'Pasta para Sopa', 'Tapas de Lasaña');

-- Condimentos y especias
update public.productos_catalogo set categoria = 'Condimentos y especias'
where nombre in ('Sal', 'Sal Gruesa', 'Pimentón', 'Orégano', 'Pimienta Negra', 'Ají Molido', 'Comino',
                 'Canela', 'Curry', 'Laurel', 'Nuez Moscada', 'Provenzal', 'Caldo en Cubos');

-- Aderezos
update public.productos_catalogo set categoria = 'Aderezos'
where nombre in ('Mayonesa', 'Ketchup', 'Mostaza', 'Salsa Golf', 'Salsa Barbacoa', 'Salsa de Soja',
                 'Chimichurri', 'Vinagre', 'Aceto Balsámico');

-- Repostería
update public.productos_catalogo set categoria = 'Repostería'
where nombre in ('Polvo de Hornear', 'Levadura', 'Bicarbonato de Sodio', 'Esencia de Vainilla', 'Maicena',
                 'Fécula de Mandioca', 'Azúcar Impalpable', 'Chocolate Cobertura', 'Coco Rallado',
                 'Gelatina', 'Gelatina sin Sabor', 'Premezcla para Bizcochuelo', 'Premezcla para Panqueques');

-- Almacén: todo lo que quedaba en "Otros" (arroz, harinas, legumbres,
-- aceites, conservas, dulces, desayuno...). "Otros" queda para lo que no
-- entre en ninguna (por ejemplo, lo que no es comida).
update public.productos_catalogo set categoria = 'Almacén'
where categoria = 'Otros' and estado = 'aprobado';

-- Tipos de pasta que faltaban (sin foto todavía: se la carga un admin desde
-- Admin → Catálogo, o se agrega a assets/catalogo).
insert into public.productos_catalogo (nombre, categoria, unidad, estado) values
  ('Mostachol', 'Pastas', 'paquete', 'aprobado'),
  ('Codito', 'Pastas', 'paquete', 'aprobado'),
  ('Tirabuzón', 'Pastas', 'paquete', 'aprobado'),
  ('Moñito', 'Pastas', 'paquete', 'aprobado'),
  ('Municiones', 'Pastas', 'paquete', 'aprobado'),
  ('Cabello de Ángel', 'Pastas', 'paquete', 'aprobado'),
  ('Fideos de Arroz', 'Pastas', 'paquete', 'aprobado'),
  ('Canelones', 'Pastas', 'paquete', 'aprobado'),
  ('Sorrentinos', 'Pastas', 'paquete', 'aprobado')
on conflict do nothing;
