-- Saca de productos_catalogo.imagen_url los 64 links viejos a Open Food Facts.
--
-- Eran la foto de esos productos antes de que las fotos pasaran a vivir en el
-- repo (assets/catalogo, ver incidentes-sprint5-6.md #15). La app usa primero
-- la foto local y solo cae a imagen_url si no hay (imagenDeCatalogo en
-- src/lib/catalogoImagenes.ts); se verificó que los 64 tienen foto local, así
-- que esos links no se mostraban nunca. Tampoco servían de respaldo: varias de
-- esas fotos son las que se reemplazaron por estar equivocadas o tener marca
-- (incidentes-sprint5-6.md #17), y dependían de un sitio externo.
--
-- imagen_url se sigue usando para las fotos de las sugerencias aprobadas
-- (bucket catalogo-sugerencias), que no tienen foto en el repo: esas no se tocan.
-- Los créditos de las fotos (assets/catalogo/creditos.json) tampoco cambian.
update public.productos_catalogo
set imagen_url = null
where imagen_url like 'https://%openfoodfacts.org/%';
