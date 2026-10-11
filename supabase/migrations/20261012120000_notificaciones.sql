-- Notificaciones (campanita + push al teléfono).
--
-- Las notificaciones NO las crea la app: las generan triggers y un job
-- diario del lado de Postgres, así ningún flujo del cliente tiene que
-- "acordarse" de avisar (mismo criterio que actividad_hogar en
-- 20260907130000_actividad_hogar.sql), y llegan igual si la acción la hizo
-- otra persona desde otro celular.
--
--   * hogar_miembros  -> solicitudes, invitaciones, aceptaciones, rechazos,
--                        expulsiones y "ahora sos dueño".
--   * productos       -> stock bajo / sin stock (al cruzar el mínimo).
--   * productos_catalogo -> sugerencias nuevas (a admins), aprobadas y
--                        rechazadas (a quien sugirió).
--   * pg_cron diario  -> productos por vencer y vencidos, con los días de
--                        anticipación que eligió cada usuario o cada producto.
--   * notificaciones  -> cada fila nueva se manda como push a los
--                        celulares registrados del usuario (Expo Push API
--                        vía pg_net).
--
-- Ver docs/arquitectura-del-codigo.md (sección de notificaciones) y
-- docs/incidentes-sprint10.md.

-- pg_net en el esquema `extensions` (no en `public`, que el linter de
-- seguridad marca: queda expuesto en la API). Sus funciones viven igual en
-- el esquema `net` (net.http_post). Ver incidentes-sprint10.md #4.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- 1. Días de anticipación del aviso de vencimiento
-- ---------------------------------------------------------------------------

-- Preferencia general de cada usuario (default 7 = el umbral que ya usaba la
-- app, DIAS_PROXIMO_A_VENCER en services/productos.ts).
alter table public.usuarios
  add column if not exists dias_aviso_vencimiento smallint not null default 7
  check (dias_aviso_vencimiento between 1 and 60);

-- Opcional por producto: si está cargado, pisa la preferencia general (la
-- leche puede avisar 2 días antes y el arroz 30). Null = usar la general.
alter table public.productos
  add column if not exists dias_aviso_vencimiento smallint
  check (dias_aviso_vencimiento is null or dias_aviso_vencimiento between 1 and 60);

-- El usuario puede cambiar su propia preferencia (la policy de UPDATE de
-- usuarios ya exige que sea su fila). Se suma a `nombre`, el único otro
-- campo editable (ver 20261011120000_abm_usuarios_y_habilitado.sql).
grant update (dias_aviso_vencimiento) on public.usuarios to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Tabla de notificaciones
-- ---------------------------------------------------------------------------

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  tipo text not null check (tipo in (
    'solicitud_recibida', 'solicitud_aceptada', 'solicitud_rechazada',
    'invitacion_recibida', 'invitacion_aceptada', 'expulsado', 'ahora_sos_dueno',
    'por_vencer', 'vencido', 'stock_bajo', 'sin_stock',
    'sugerencia_nueva', 'sugerencia_aprobada', 'sugerencia_rechazada'
  )),
  titulo text not null,
  mensaje text not null,
  -- A dónde lleva tocarla (la app abre la despensa / los miembros de ese
  -- hogar). Null cuando el usuario ya no tiene acceso (expulsado, rechazado).
  hogar_id uuid references public.hogares (id) on delete cascade,
  producto_id uuid references public.productos (id) on delete set null,
  -- Evita repetir la misma notificación (p. ej. el job diario de
  -- vencimientos no avisa dos veces por el mismo lote y la misma fecha).
  clave text,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists notificaciones_usuario_clave_unica
  on public.notificaciones (usuario_id, clave) where clave is not null;
create index if not exists notificaciones_usuario_fecha
  on public.notificaciones (usuario_id, created_at desc);

alter table public.notificaciones enable row level security;

-- Cada uno ve, marca como leídas y borra SOLO las suyas. A propósito sin
-- `or es_administrador()`: las notificaciones son personales, ni un admin
-- tiene por qué verlas (y así "mis notificaciones" no puede mezclar las de
-- otros, ver incidentes-sprint2.md #2).
create policy "notificaciones_select_propias"
  on public.notificaciones for select to authenticated
  using (usuario_id = auth.uid() and public.usuario_habilitado());

create policy "notificaciones_update_propias"
  on public.notificaciones for update to authenticated
  using (usuario_id = auth.uid() and public.usuario_habilitado())
  with check (usuario_id = auth.uid());

create policy "notificaciones_delete_propias"
  on public.notificaciones for delete to authenticated
  using (usuario_id = auth.uid() and public.usuario_habilitado());

-- Nadie inserta desde el cliente (solo los triggers/job, SECURITY DEFINER),
-- y lo único que se puede cambiar es `leida` -- mismo patrón que
-- hogar_miembros en incidentes-sprint2.md #1.
revoke insert, update on public.notificaciones from authenticated, anon;
grant update (leida) on public.notificaciones to authenticated;

-- La app muestra el cartelito y suma al contador de la campanita apenas
-- llega una (Realtime respeta la policy de SELECT).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notificaciones'
  ) then
    alter publication supabase_realtime add table public.notificaciones;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Helpers internos para crear notificaciones
-- ---------------------------------------------------------------------------

-- Crea una notificación para un usuario. No hace nada si la cuenta está
-- deshabilitada o si ya existe otra con la misma `clave`. Solo la usan los
-- triggers/job de este archivo.
create or replace function public.crear_notificacion(
  p_usuario_id uuid,
  p_tipo text,
  p_titulo text,
  p_mensaje text,
  p_hogar_id uuid default null,
  p_producto_id uuid default null,
  p_clave text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.usuarios where id = p_usuario_id and habilitado) then
    return;
  end if;

  insert into public.notificaciones (usuario_id, tipo, titulo, mensaje, hogar_id, producto_id, clave)
  values (p_usuario_id, p_tipo, p_titulo, p_mensaje, p_hogar_id, p_producto_id, p_clave)
  on conflict (usuario_id, clave) where clave is not null do nothing;
end;
$$;

-- Nombre para mostrar de un usuario en un mensaje ("Ana quiere unirse...").
create or replace function public.nombre_para_mostrar(p_usuario_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(nombre), ''), email, 'Alguien') from public.usuarios where id = p_usuario_id;
$$;

revoke execute on function public.crear_notificacion(uuid, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.nombre_para_mostrar(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Hogares: solicitudes, invitaciones, aceptaciones, expulsiones
-- ---------------------------------------------------------------------------

create or replace function public.notificar_cambio_membresia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hogar_nombre text;
  v_dueno uuid;
begin
  -- Sin usuario (SQL editor, borrado en cascada desde el dashboard): no hay
  -- a quién atribuirle el cambio y el hogar o el usuario pueden estar
  -- desapareciendo en la misma transacción.
  if auth.uid() is null then
    return null;
  end if;

  select nombre into v_hogar_nombre from public.hogares where id = coalesce(new.hogar_id, old.hogar_id);
  if v_hogar_nombre is null then
    return null; -- el hogar se está borrando
  end if;

  if tg_op = 'INSERT' and new.estado = 'pendiente' then
    if new.origen = 'solicitud' then
      -- Alguien mandó el código: les avisa a los dueños.
      for v_dueno in
        select usuario_id from public.hogar_miembros where hogar_id = new.hogar_id and rol = 'dueno'
      loop
        perform public.crear_notificacion(
          v_dueno, 'solicitud_recibida', 'Nueva solicitud',
          public.nombre_para_mostrar(new.usuario_id) || ' quiere unirse a ' || v_hogar_nombre || '.',
          new.hogar_id);
      end loop;
    else
      -- Un dueño lo invitó por mail.
      perform public.crear_notificacion(
        new.usuario_id, 'invitacion_recibida', 'Te invitaron a un hogar',
        'Te invitaron a unirte a ' || v_hogar_nombre || '. Aceptala desde el inicio.', null);
    end if;

  elsif tg_op = 'UPDATE' then
    if old.estado = 'pendiente' and new.estado = 'aprobado' then
      if new.origen = 'solicitud' then
        perform public.crear_notificacion(
          new.usuario_id, 'solicitud_aceptada', '¡Te aceptaron!',
          'Ya sos parte de ' || v_hogar_nombre || '.', new.hogar_id);
      else
        for v_dueno in
          select usuario_id from public.hogar_miembros
          where hogar_id = new.hogar_id and rol = 'dueno' and usuario_id <> new.usuario_id
        loop
          perform public.crear_notificacion(
            v_dueno, 'invitacion_aceptada', 'Invitación aceptada',
            public.nombre_para_mostrar(new.usuario_id) || ' se sumó a ' || v_hogar_nombre || '.', new.hogar_id);
        end loop;
      end if;
    end if;

    -- Le pasaron el rol de dueño (ceder_dueno, o salir_de_hogar del dueño
    -- anterior). No se avisa si se lo dio uno mismo.
    if old.rol = 'invitado' and new.rol = 'dueno' and new.usuario_id <> auth.uid() then
      perform public.crear_notificacion(
        new.usuario_id, 'ahora_sos_dueno', 'Ahora sos el dueño',
        'Ahora sos el dueño de ' || v_hogar_nombre || '.', new.hogar_id);
    end if;

  elsif tg_op = 'DELETE' and old.usuario_id <> auth.uid() then
    -- Solo si lo hizo OTRA persona: cancelar mi propia solicitud o salir yo
    -- de un hogar no me avisa nada (ver incidentes-sprint4.md #2, el mismo
    -- problema resuelto acá desde la base: aquí sí se sabe quién borró).
    if old.estado = 'pendiente' and old.origen = 'solicitud' then
      perform public.crear_notificacion(
        old.usuario_id, 'solicitud_rechazada', 'Solicitud rechazada',
        'No te aceptaron en ' || v_hogar_nombre || '. Podés volver a pedirlo con el código.', null);
    elsif old.estado = 'aprobado' then
      perform public.crear_notificacion(
        old.usuario_id, 'expulsado', 'Te sacaron de un hogar',
        'Ya no formás parte de ' || v_hogar_nombre || '.', null);
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists notificar_cambio_membresia on public.hogar_miembros;
create trigger notificar_cambio_membresia
  after insert or update or delete on public.hogar_miembros
  for each row execute function public.notificar_cambio_membresia();

-- ---------------------------------------------------------------------------
-- 5. Stock bajo / sin stock
-- ---------------------------------------------------------------------------

-- 0 = sin alerta, 1 = bajo, 2 = sin stock. Misma regla que estadoStock() en
-- src/services/productos.ts: sin mínimo nunca alerta; "bajo" es estricto.
create or replace function public.nivel_stock(p_total numeric, p_minimo numeric)
returns integer
language sql
immutable
set search_path = public
as $$
  select case
    when p_minimo is null or p_minimo <= 0 then 0
    when p_total <= 0 then 2
    when p_total < p_minimo then 1
    else 0
  end;
$$;

-- Avisa a los miembros del hogar cuando un PRODUCTO (todos sus lotes, igual
-- que agruparProductos en la app) cruza hacia abajo su stock mínimo, o pasa
-- de "bajo" a "sin stock". No repite mientras siga bajo (restar de a uno no
-- manda una notificación por cada toque). Los DELETE no avisan: borrar un
-- lote no es "se terminó", y en un borrado en cascada del hogar no hay a
-- dónde apuntar la notificación.
create or replace function public.notificar_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric;
  v_minimo numeric;
  v_minimo_otros numeric;
  v_total_antes numeric;
  v_minimo_antes numeric;
  v_nivel integer;
  v_nivel_antes integer;
  v_hogar_nombre text;
  v_miembro uuid;
begin
  -- El grupo después del cambio (el trigger es AFTER: la tabla ya lo tiene).
  select coalesce(sum(cantidad), 0), coalesce(max(stock_minimo), 0)
  into v_total, v_minimo
  from public.productos
  where hogar_id = new.hogar_id and lower(trim(nombre)) = lower(trim(new.nombre)) and unidad = new.unidad;

  -- El mismo grupo antes del cambio.
  select coalesce(max(stock_minimo), 0) into v_minimo_otros
  from public.productos
  where hogar_id = new.hogar_id and lower(trim(nombre)) = lower(trim(new.nombre)) and unidad = new.unidad
    and id <> new.id;

  if tg_op = 'INSERT' then
    v_total_antes := v_total - new.cantidad;
    v_minimo_antes := v_minimo_otros;
  else
    v_total_antes := v_total - new.cantidad + old.cantidad;
    v_minimo_antes := greatest(v_minimo_otros, old.stock_minimo);
  end if;

  v_nivel := public.nivel_stock(v_total, v_minimo);
  v_nivel_antes := public.nivel_stock(v_total_antes, v_minimo_antes);

  if v_nivel <= v_nivel_antes then
    return null;
  end if;

  select nombre into v_hogar_nombre from public.hogares where id = new.hogar_id;

  for v_miembro in
    select usuario_id from public.hogar_miembros where hogar_id = new.hogar_id and estado = 'aprobado'
  loop
    if v_nivel = 2 then
      perform public.crear_notificacion(
        v_miembro, 'sin_stock', 'Sin stock: ' || new.nombre,
        'Se terminó ' || new.nombre || ' en ' || v_hogar_nombre || '.', new.hogar_id, new.id);
    else
      perform public.crear_notificacion(
        v_miembro, 'stock_bajo', 'Stock bajo: ' || new.nombre,
        -- trim_scale: 3.000 -> "3", 0.500 -> "0.5" (to_char deja "3." en enteros).
        'Quedan ' || trim_scale(v_total)::text || ' ' || new.unidad || ' de ' || new.nombre
          || ' en ' || v_hogar_nombre || ' (mínimo ' || trim_scale(v_minimo)::text || ').',
        new.hogar_id, new.id);
    end if;
  end loop;

  return null;
end;
$$;

drop trigger if exists notificar_stock on public.productos;
create trigger notificar_stock
  after insert or update of cantidad, stock_minimo on public.productos
  for each row execute function public.notificar_stock();

-- ---------------------------------------------------------------------------
-- 6. Sugerencias del catálogo
-- ---------------------------------------------------------------------------

create or replace function public.notificar_sugerencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  if tg_op = 'INSERT' and new.estado = 'pendiente' then
    for v_admin in
      select id from public.usuarios where rol = 'administrador' and habilitado and id <> auth.uid()
    loop
      perform public.crear_notificacion(
        v_admin, 'sugerencia_nueva', 'Nueva sugerencia de producto',
        public.nombre_para_mostrar(auth.uid()) || ' sugirió "' || new.nombre || '" para el catálogo.');
    end loop;
  elsif tg_op = 'UPDATE' and old.estado = 'pendiente' and new.estado = 'aprobado' and new.sugerido_por is not null then
    perform public.crear_notificacion(
      new.sugerido_por, 'sugerencia_aprobada', '¡Aprobaron tu sugerencia!',
      '"' || new.nombre || '" ya está en el catálogo.');
  elsif tg_op = 'DELETE' and old.estado = 'pendiente' and old.sugerido_por is not null
        and old.sugerido_por <> auth.uid() then
    perform public.crear_notificacion(
      old.sugerido_por, 'sugerencia_rechazada', 'Sugerencia no aprobada',
      'Tu sugerencia "' || old.nombre || '" no se sumó al catálogo.');
  end if;

  return null;
end;
$$;

drop trigger if exists notificar_sugerencia on public.productos_catalogo;
create trigger notificar_sugerencia
  after insert or update or delete on public.productos_catalogo
  for each row execute function public.notificar_sugerencia();

-- ---------------------------------------------------------------------------
-- 7. Vencimientos (job diario)
-- ---------------------------------------------------------------------------

-- Recorre los productos con fecha y alerta habilitada de cada miembro
-- habilitado, y avisa:
--   * 'por_vencer' una vez, cuando le quedan N días o menos, con N =
--     el del producto si lo tiene, si no la preferencia del usuario.
--   * 'vencido' una vez, si venció en la última semana (no se avisa por
--     cosas vencidas hace meses la primera vez que corre).
-- La `clave` incluye la fecha: si se corrige la fecha, se vuelve a avisar.
-- Fecha de "hoy" en hora de Argentina (el servidor está en UTC).
create or replace function public.generar_notificaciones_vencimiento()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  v_fila record;
  v_dias integer;
  v_cuando text;
  v_nombre text;
  v_creadas integer := 0;
begin
  for v_fila in
    select p.id, p.hogar_id, p.nombre, p.marca, p.fecha_vencimiento,
           coalesce(p.dias_aviso_vencimiento, u.dias_aviso_vencimiento) as umbral,
           h.nombre as hogar_nombre, u.id as usuario_id
    from public.productos p
    join public.hogares h on h.id = p.hogar_id
    join public.hogar_miembros hm on hm.hogar_id = p.hogar_id and hm.estado = 'aprobado'
    join public.usuarios u on u.id = hm.usuario_id and u.habilitado
    where p.fecha_vencimiento is not null
      and p.alerta_vencimiento_habilitada
      and p.cantidad > 0
      and p.fecha_vencimiento >= v_hoy - 7
  loop
    v_dias := v_fila.fecha_vencimiento - v_hoy;
    v_nombre := v_fila.nombre || coalesce(' (' || v_fila.marca || ')', '');

    if v_dias < 0 then
      perform public.crear_notificacion(
        v_fila.usuario_id, 'vencido', 'Se venció: ' || v_fila.nombre,
        v_nombre || ' en ' || v_fila.hogar_nombre || ' venció el '
          || to_char(v_fila.fecha_vencimiento, 'DD/MM') || '.',
        v_fila.hogar_id, v_fila.id, 'vencido:' || v_fila.id || ':' || v_fila.fecha_vencimiento);
      v_creadas := v_creadas + 1;
    elsif v_dias <= v_fila.umbral then
      v_cuando := case v_dias when 0 then 'vence hoy' when 1 then 'vence mañana' else 'vence en ' || v_dias || ' días' end;
      perform public.crear_notificacion(
        v_fila.usuario_id, 'por_vencer', 'Por vencer: ' || v_fila.nombre,
        v_nombre || ' en ' || v_fila.hogar_nombre || ' ' || v_cuando || '.',
        v_fila.hogar_id, v_fila.id, 'por_vencer:' || v_fila.id || ':' || v_fila.fecha_vencimiento);
      v_creadas := v_creadas + 1;
    end if;
  end loop;

  return v_creadas; -- intentos (las repetidas las descarta crear_notificacion)
end;
$$;

revoke execute on function public.generar_notificaciones_vencimiento() from public, anon, authenticated;

-- Todos los días a las 12:00 UTC = 9:00 de Argentina (una hora razonable
-- para que suene el celular). Se desagenda antes por si se reaplica.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'notificar-vencimientos') then
    perform cron.unschedule('notificar-vencimientos');
  end if;
  perform cron.schedule('notificar-vencimientos', '0 12 * * *', 'select public.generar_notificaciones_vencimiento()');
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Push al teléfono (Expo Push API)
-- ---------------------------------------------------------------------------

-- Un celular registrado = un token de Expo. Un usuario puede tener varios
-- (celular y tablet); si el mismo celular se loguea con otra cuenta, el
-- token pasa a la cuenta nueva.
create table if not exists public.push_tokens (
  token text primary key,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  plataforma text,
  updated_at timestamptz not null default now()
);

-- Sin policies: nadie la lee ni la escribe desde el cliente, solo por las
-- dos RPCs de abajo (los tokens de otros no son de nadie más).
alter table public.push_tokens enable row level security;
revoke all on public.push_tokens from authenticated, anon;

create or replace function public.registrar_push_token(p_token text, p_plataforma text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.usuario_habilitado() then
    raise exception 'Necesitás una sesión activa para recibir notificaciones' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'Token de notificaciones inválido';
  end if;

  insert into public.push_tokens (token, usuario_id, plataforma, updated_at)
  values (p_token, auth.uid(), p_plataforma, now())
  on conflict (token) do update set usuario_id = auth.uid(), plataforma = excluded.plataforma, updated_at = now();
end;
$$;

-- Al cerrar sesión: ese celular deja de recibir las notificaciones de esta
-- cuenta.
create or replace function public.eliminar_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_tokens where token = p_token and usuario_id = auth.uid();
$$;

revoke execute on function public.registrar_push_token(text, text) from public, anon;
revoke execute on function public.eliminar_push_token(text) from public, anon;
grant execute on function public.registrar_push_token(text, text) to authenticated;
grant execute on function public.eliminar_push_token(text) to authenticated;

-- Cada notificación nueva se manda a los celulares de su usuario. pg_net es
-- asíncrono (el pedido sale cuando termina la transacción) y un fallo acá
-- nunca debe impedir que se guarde la notificación: queda en la campanita
-- aunque el push no salga.
create or replace function public.enviar_push_notificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mensajes jsonb;
begin
  select jsonb_agg(jsonb_build_object(
    'to', t.token,
    'title', new.titulo,
    'body', new.mensaje,
    'sound', 'default',
    'channelId', 'default',
    'data', jsonb_build_object('notificacionId', new.id, 'tipo', new.tipo, 'hogarId', new.hogar_id)
  ))
  into v_mensajes
  from public.push_tokens t
  where t.usuario_id = new.usuario_id;

  if v_mensajes is not null then
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := v_mensajes,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end if;
  return null;
exception when others then
  raise warning '[notificaciones] no se pudo enviar el push de %: %', new.id, sqlerrm;
  return null;
end;
$$;

drop trigger if exists enviar_push_notificacion on public.notificaciones;
create trigger enviar_push_notificacion
  after insert on public.notificaciones
  for each row execute function public.enviar_push_notificacion();

revoke execute on function public.notificar_cambio_membresia() from public, anon, authenticated;
revoke execute on function public.notificar_stock() from public, anon, authenticated;
revoke execute on function public.notificar_sugerencia() from public, anon, authenticated;
revoke execute on function public.enviar_push_notificacion() from public, anon, authenticated;
