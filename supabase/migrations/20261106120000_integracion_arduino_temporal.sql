-- =============================================================================
-- INTEGRACIÓN ARDUINO (temporal) — ver docs/integracion-arduino-temporal.md.
--
-- Esta migración es parte de una integración pensada para desactivarse o
-- borrarse por completo más adelante (no es parte de los 10 sprints
-- planificados del proyecto). Guarda, por hogar, los candidatos a producto
-- que detecta el dispositivo ESP32-CAM + servidor Node (ver
-- esp32_gemini/proyecto) para que alguien los confirme desde la app antes de
-- que se conviertan en una fila real de `productos` (igual criterio que
-- ocr-ticket/vencimiento-foto: la IA nunca escribe directo en el inventario).
--
-- Para eliminar esta integración por completo: ver la sección "Eliminarla
-- del todo" de docs/integracion-arduino-temporal.md (empieza borrando esta
-- tabla con `drop table if exists public.candidatos_arduino;`).
-- =============================================================================

create table public.candidatos_arduino (
  id uuid primary key default gen_random_uuid(),
  hogar_id uuid not null references public.hogares(id) on delete cascade,
  -- Qué clasificó Gemini en la Edge Function arduino-reconocer-foto: un
  -- ticket de compra (varios productos de una fotografía del comprobante)
  -- o la foto de un producto suelto. Es solo informativo para la UI de
  -- confirmación -- ambos tipos terminan como filas independientes acá.
  tipo text not null check (tipo in ('ticket', 'producto')),
  nombre text not null,
  marca text,
  categoria text,
  unidad text not null default 'unidad',
  cantidad numeric not null default 1,
  confianza text check (confianza in ('alta', 'media', 'baja')),
  -- 'pendiente': esperando que alguien del hogar lo confirme o descarte
  -- desde ArduinoCandidatosScreen. 'confirmado'/'descartado' quedan como
  -- historial simple (no se borran) hasta que se limpien a mano o se
  -- elimine la tabla entera.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'descartado')),
  created_at timestamptz not null default now()
);

comment on table public.candidatos_arduino is
  'INTEGRACIÓN ARDUINO (temporal): candidatos a producto detectados por el dispositivo ESP32-CAM, pendientes de confirmación manual. Ver docs/integracion-arduino-temporal.md.';

alter table public.candidatos_arduino enable row level security;

-- Insertar lo hace la Edge Function arduino-reconocer-foto con la service
-- role key (bypasea RLS) -- acá solo se exponen las policies que necesita
-- la app para que un miembro del hogar vea y resuelva sus candidatos
-- pendientes, mismo criterio que las policies de "productos".
create policy "candidatos_arduino_select_propio_hogar_o_miembro_o_admin"
  on public.candidatos_arduino for select
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());

create policy "candidatos_arduino_update_propio_hogar_o_miembro_o_admin"
  on public.candidatos_arduino for update
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador())
  with check (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());

create policy "candidatos_arduino_delete_propio_hogar_o_miembro_o_admin"
  on public.candidatos_arduino for delete
  using (hogar_id = public.hogar_id_actual() or public.es_miembro_de(hogar_id) or public.es_administrador());
