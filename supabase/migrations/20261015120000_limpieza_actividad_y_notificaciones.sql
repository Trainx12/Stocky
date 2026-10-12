-- Limpieza automática de datos viejos (pedido del equipo, Sprint 10): que la
-- base no acumule para siempre filas que la app ya no muestra.
--
--   * actividad_hogar: se borra una fila si tiene MÁS DE 90 DÍAS o si queda
--     fuera de las ÚLTIMAS 150 de su hogar (lo que pase primero). El Home
--     muestra las últimas 5; 150 deja margen para una futura pantalla de
--     "toda la actividad" y para saber quién hizo qué en los últimos meses.
--   * notificaciones: se borran las YA LEÍDAS con más de 60 días. Las no
--     leídas no se tocan (nadie las vio todavía). Los 60 días se cuentan
--     desde que se creó la notificación (no se guarda cuándo se leyó).
--     Las de vencimiento tienen una `clave` única: borrar una vieja no hace
--     que se repita, porque el job de vencimientos solo avisa de productos
--     que vencen dentro de la ventana de aviso o vencieron hace menos de una
--     semana.
--
-- Corre todos los días a las 06:00 UTC (03:00 de Argentina, cuando casi nadie
-- usa la app) con pg_cron, igual que el aviso diario de vencimientos.

-- Para que el "últimas 150 por hogar" no recorra la tabla entera.
create index if not exists actividad_hogar_hogar_fecha
  on public.actividad_hogar (hogar_id, created_at desc);

create or replace function public.limpiar_datos_viejos()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actividad integer;
  v_notificaciones integer;
begin
  delete from public.actividad_hogar a
  using (
    select id, created_at,
           row_number() over (partition by hogar_id order by created_at desc, id desc) as posicion
    from public.actividad_hogar
  ) r
  where a.id = r.id
    and (r.posicion > 150 or r.created_at < now() - interval '90 days');
  get diagnostics v_actividad = row_count;

  delete from public.notificaciones
  where leida and created_at < now() - interval '60 days';
  get diagnostics v_notificaciones = row_count;

  -- Cuánto borró, por si se corre a mano para revisar.
  return jsonb_build_object('actividad', v_actividad, 'notificaciones', v_notificaciones);
end;
$$;

-- Solo la corre el job (nadie desde la app).
revoke execute on function public.limpiar_datos_viejos() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpiar-datos-viejos') then
    perform cron.unschedule('limpiar-datos-viejos');
  end if;
  perform cron.schedule('limpiar-datos-viejos', '0 6 * * *', 'select public.limpiar_datos_viejos()');
end;
$$;
