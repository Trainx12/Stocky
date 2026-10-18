-- Categoría "Conservas" (pedido de Facundo, 2026-10-13): productos en lata
-- o frasco, de larga duración. Salen de "Almacén" y se suman las conservas
-- de pescado y el tomate perita, que faltaban. Como en la reorganización
-- anterior, solo cambia el catálogo, no las despensas.
-- Rama feature/panel-admin.

update public.productos_catalogo set categoria = 'Conservas'
where nombre in ('Aceitunas', 'Ananá en Almíbar', 'Durazno en Almíbar', 'Choclo en Lata', 'Morrones en Lata',
                 'Palmitos', 'Pepinillos', 'Arvejas', 'Leche de Coco');

insert into public.productos_catalogo (nombre, categoria, unidad, estado) values
  ('Atún en Lata', 'Conservas', 'unidad', 'aprobado'),
  ('Caballa en Lata', 'Conservas', 'unidad', 'aprobado'),
  ('Sardinas en Lata', 'Conservas', 'unidad', 'aprobado'),
  ('Tomate Perita en Lata', 'Conservas', 'unidad', 'aprobado')
on conflict do nothing;
