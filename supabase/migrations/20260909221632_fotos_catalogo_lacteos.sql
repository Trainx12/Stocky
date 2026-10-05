-- Fotos de Open Food Facts (https://world.openfoodfacts.org) para los
-- primeros productos del catálogo -- Lácteos. Cada URL es la foto real de
-- un producto argentino cargado en esa base de datos abierta, elegida por
-- ser el match más genérico/representativo del nombre (no un producto de
-- una marca puntual salvo que sea la única foto disponible para ese ítem,
-- como el caso de Dulce de Leche). Se sigue completando el resto de las
-- categorías en migraciones siguientes -- Open Food Facts rate-limita
-- bastante agresivo a usuarios anónimos, así que esto se hace de a tandas.
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/074/236/3008/front_en.3.400.jpg' where nombre = 'Leche';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/391/301/3993/front_en.26.400.jpg' where nombre = 'Yogur';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/039/810/0132/front_es.34.400.jpg' where nombre = 'Queso Rallado';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/394/005/4006/front_es.42.400.jpg' where nombre = 'Manteca';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/499/087/9656/front_es.43.400.jpg' where nombre = 'Queso Cremoso';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/074/237/3908/front_en.12.400.jpg' where nombre = 'Dulce de Leche';
