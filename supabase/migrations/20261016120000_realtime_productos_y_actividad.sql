-- Que los cambios de productos se vean en el momento en los otros celulares
-- (reporte del equipo: si una persona agregaba un producto, a otra con la app
-- abierta no se le actualizaba hasta salir y volver a entrar).
--
-- `productos` y `actividad_hogar` no estaban en la publicación de Realtime
-- (solo hogar_miembros, notificaciones y usuarios). Realtime respeta las
-- policies de SELECT de cada tabla: cada uno recibe solo los cambios de los
-- hogares que puede ver. Sin lista de columnas (ver incidentes-sprint4.md #4).
-- Con la replica identity por defecto, un DELETE trae solo el id del producto
-- borrado, que es lo que usa la app para saber si le afecta.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'productos'
  ) then
    alter publication supabase_realtime add table public.productos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'actividad_hogar'
  ) then
    alter publication supabase_realtime add table public.actividad_hogar;
  end if;
end;
$$;
