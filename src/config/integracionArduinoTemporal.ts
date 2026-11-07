/**
 * INTEGRACIÓN ARDUINO (temporal) — ver docs/integracion-arduino-temporal.md.
 *
 * Único interruptor de esta integración del lado de la app: en false, el
 * acceso rápido de HomeScreen y la pantalla de candidatos quedan ocultos sin
 * tocar el resto del código (la Edge Function y la tabla en Supabase pueden
 * seguir existiendo sin efecto visible). Para eliminar la integración por
 * completo (no solo ocultarla) seguir los pasos de
 * docs/integracion-arduino-temporal.md.
 */
export const INTEGRACION_ARDUINO_ACTIVA = true;
