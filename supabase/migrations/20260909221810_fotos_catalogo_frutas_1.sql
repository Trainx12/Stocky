-- Fotos de Open Food Facts para Verduras y frutas -- primera tanda
-- (Open Food Facts rate-limita fuerte a usuarios anónimos, así que esto
-- se completa de a poco en varias migraciones).
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/811/330/1772/front_es.4.400.jpg' where nombre = 'Naranja';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/814/113/2720/front_es.4.400.jpg' where nombre = 'Frutilla';
update public.productos_catalogo set imagen_url = 'https://images.openfoodfacts.org/images/products/779/826/202/0036/front_es.3.400.jpg' where nombre = 'Manzana';
