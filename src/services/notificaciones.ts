import { supabase } from '../lib/supabase';
import type { Notificacion, Producto, TipoNotificacion } from '../types/database';
import { diasAvisoDe, esDiasAvisoValido, DIAS_AVISO_MAXIMO, DIAS_AVISO_MINIMO } from './productos';

/**
 * Notificaciones de la campanita (Sprint 10). Las filas de `notificaciones`
 * las crean triggers y un job diario en Postgres (ver migración
 * 20261012120000_notificaciones.sql): la app solo las lee, las marca como
 * leídas y las borra. Por eso acá no hay ningún "crearNotificacion".
 *
 * Todas las consultas filtran explícito por el usuario logueado aunque la
 * RLS ya lo haga (incidentes-sprint2.md #2: "mis X" nunca confía solo en la
 * RLS).
 */

// Cuántas trae la campanita: las recientes alcanzan; las viejas se pueden
// borrar.
export const LIMITE_NOTIFICACIONES = 50;

async function usuarioActualId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error('No hay una sesión activa');
  return id;
}

// Las notificaciones más recientes del usuario logueado, nuevas primero.
export async function listarNotificaciones(limite = LIMITE_NOTIFICACIONES): Promise<Notificacion[]> {
  const usuarioId = await usuarioActualId();
  const { data, error } = await supabase
    .from('notificaciones')
    .select('*')
    .eq('usuario_id', usuarioId)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return data ?? [];
}

// Cuántas sin leer tiene el usuario (para el numerito de la campanita).
// `head: true` no trae filas, solo el conteo.
export async function contarNoLeidas(): Promise<number> {
  const usuarioId = await usuarioActualId();
  const { count, error } = await supabase
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .eq('usuario_id', usuarioId)
    .eq('leida', false);

  if (error) throw error;
  return count ?? 0;
}

// Marca como leídas algunas notificaciones puntuales (al tocarlas).
export async function marcarLeidas(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const usuarioId = await usuarioActualId();
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('usuario_id', usuarioId)
    .in('id', ids);
  if (error) throw error;
}

// "Marcar todas como leídas".
export async function marcarTodasLeidas(): Promise<void> {
  const usuarioId = await usuarioActualId();
  const { error } = await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('usuario_id', usuarioId)
    .eq('leida', false);
  if (error) throw error;
}

// Borra una notificación de la campanita.
export async function eliminarNotificacion(id: string): Promise<void> {
  const usuarioId = await usuarioActualId();
  const { error } = await supabase.from('notificaciones').delete().eq('usuario_id', usuarioId).eq('id', id);
  if (error) throw error;
}

// Productos con fecha de vencimiento de varios hogares (los del usuario),
// para programar los avisos locales. Filtra por `hogarIds` explícito, no
// solo RLS (un admin ve todos los hogares).
export async function listarProductosConFecha(hogarIds: string[]): Promise<Producto[]> {
  if (hogarIds.length === 0) return [];
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .in('hogar_id', hogarIds)
    .not('fecha_vencimiento', 'is', null);
  if (error) throw error;
  return data ?? [];
}

// Guarda la preferencia general "Avisarme X días antes de que venza". Es la
// única columna de `usuarios` (además del nombre) que el usuario puede
// cambiar por su cuenta; la base vuelve a validar el rango con un check.
export async function guardarDiasAvisoGeneral(dias: number): Promise<void> {
  if (!esDiasAvisoValido(dias)) {
    throw new Error(`Elegí un número entero de días entre ${DIAS_AVISO_MINIMO} y ${DIAS_AVISO_MAXIMO}`);
  }
  const usuarioId = await usuarioActualId();
  const { error } = await supabase.from('usuarios').update({ dias_aviso_vencimiento: dias }).eq('id', usuarioId);
  if (error) throw error;
}

/**
 * Lógica pura de la pantalla (testeada aparte con Jest).
 */

// Ícono (Ionicons) y "familia" de color de cada tipo. La familia se traduce
// a un color del theme en la pantalla: vencimientos en coral, stock en
// ámbar (mismos colores que los badges de la despensa), lo bueno en verde y
// el resto en el violeta de la app.
export type FamiliaNotificacion = 'vencimiento' | 'stock' | 'exito' | 'aviso' | 'hogar';

export function aparienciaNotificacion(tipo: TipoNotificacion): { icono: string; familia: FamiliaNotificacion } {
  switch (tipo) {
    case 'por_vencer':
      return { icono: 'time-outline', familia: 'vencimiento' };
    case 'vencido':
      return { icono: 'alert-circle-outline', familia: 'vencimiento' };
    case 'stock_bajo':
      return { icono: 'trending-down-outline', familia: 'stock' };
    case 'sin_stock':
      return { icono: 'cart-outline', familia: 'stock' };
    case 'solicitud_aceptada':
    case 'invitacion_aceptada':
    case 'sugerencia_aprobada':
    case 'ahora_sos_dueno':
      return { icono: 'checkmark-circle-outline', familia: 'exito' };
    case 'solicitud_rechazada':
    case 'expulsado':
    case 'sugerencia_rechazada':
      return { icono: 'close-circle-outline', familia: 'aviso' };
    case 'solicitud_recibida':
      return { icono: 'person-add-outline', familia: 'hogar' };
    case 'invitacion_recibida':
      return { icono: 'mail-outline', familia: 'hogar' };
    case 'sugerencia_nueva':
      return { icono: 'bulb-outline', familia: 'hogar' };
  }
}

// A dónde lleva tocar una notificación:
//   - 'despensa': la despensa de ese hogar, con el filtro que corresponda.
//   - 'miembros': "Miembros del hogar" (para aceptar/rechazar la solicitud).
//   - 'inicio': Home (invitaciones recibidas, aceptaciones).
//   - 'sugerencias': la pantalla de admin de sugerencias.
//   - null: no lleva a ningún lado (el hogar ya no es accesible).
export type DestinoNotificacion =
  | { pantalla: 'despensa'; hogarId: string; filtro: 'porVencer' | 'stockBajo' }
  | { pantalla: 'miembros'; hogarId: string }
  | { pantalla: 'inicio' }
  | { pantalla: 'sugerencias' }
  | null;

export function destinoNotificacion(n: Pick<Notificacion, 'tipo' | 'hogar_id'>): DestinoNotificacion {
  switch (n.tipo) {
    case 'por_vencer':
    case 'vencido':
      return n.hogar_id ? { pantalla: 'despensa', hogarId: n.hogar_id, filtro: 'porVencer' } : null;
    case 'stock_bajo':
    case 'sin_stock':
      return n.hogar_id ? { pantalla: 'despensa', hogarId: n.hogar_id, filtro: 'stockBajo' } : null;
    case 'solicitud_recibida':
      return n.hogar_id ? { pantalla: 'miembros', hogarId: n.hogar_id } : null;
    case 'invitacion_recibida':
    case 'solicitud_aceptada':
    case 'invitacion_aceptada':
    case 'ahora_sos_dueno':
      return { pantalla: 'inicio' };
    case 'sugerencia_nueva':
      return { pantalla: 'sugerencias' };
    default:
      return null;
  }
}

// Un aviso de vencimiento para programar en el propio celular (ver
// lib/notificacionesPush.ts): plan B cuando el push remoto no está
// disponible (sin credenciales de Firebase todavía, o permiso denegado al
// servidor). Así los vencimientos llegan igual con la app cerrada.
export interface AvisoLocal {
  id: string;
  titulo: string;
  mensaje: string;
  fecha: Date;
}

// Máximo de avisos locales programados a la vez (iOS no deja más de 64).
export const MAXIMO_AVISOS_LOCALES = 50;

// Calcula cuándo avisar de cada producto: el día en que entra en la ventana
// de aviso (fecha de vencimiento menos sus días de aviso, el propio o el
// general), a las `hora` de la mañana. Si ese momento ya pasó, no se
// programa: ese producto ya está en "Productos próximos a vencer" y en la
// campanita. Mismas reglas que el job diario del servidor (alerta
// habilitada, con cantidad, con fecha). Lo más próximo primero.
export function calcularAvisosLocales(
  productos: Pick<Producto, 'id' | 'nombre' | 'marca' | 'cantidad' | 'fecha_vencimiento' | 'alerta_vencimiento_habilitada' | 'dias_aviso_vencimiento'>[],
  diasPorDefecto: number,
  ahora: Date = new Date(),
  hora = 9,
): AvisoLocal[] {
  const avisos: AvisoLocal[] = [];
  for (const p of productos) {
    if (!p.fecha_vencimiento || !p.alerta_vencimiento_habilitada || p.cantidad <= 0) continue;
    const [anio, mes, dia] = p.fecha_vencimiento.split('-').map(Number);
    const dias = diasAvisoDe(p, diasPorDefecto);
    const fecha = new Date(anio, mes - 1, dia - dias, hora, 0, 0);
    if (fecha.getTime() <= ahora.getTime()) continue;

    const nombre = p.marca ? `${p.nombre} (${p.marca})` : p.nombre;
    const cuando = dias === 1 ? 'mañana' : `en ${dias} días`;
    avisos.push({ id: `vence-${p.id}-${p.fecha_vencimiento}`, titulo: `Por vencer: ${p.nombre}`, mensaje: `${nombre} vence ${cuando}.`, fecha });
  }
  return avisos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime()).slice(0, MAXIMO_AVISOS_LOCALES);
}

// Texto del globito de la campanita (BottomNavBar): nada si no hay, "9+" si
// son muchas (un número largo no entra en el círculo).
export function textoGlobito(cantidad: number): string | null {
  if (cantidad <= 0) return null;
  return cantidad > 9 ? '9+' : String(cantidad);
}

// "Recién", "Hace 5 min", "Hace 3 h", "Ayer", "Hace 4 días" o la fecha
// ("12/10") si pasó más de una semana. `ahora` es parámetro para poder
// testearlo sin mockear el reloj.
export function tiempoRelativo(iso: string, ahora: Date = new Date()): string {
  const fecha = new Date(iso);
  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60000);
  if (minutos < 1) return 'Recién';
  if (minutos < 60) return `Hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `Hace ${horas} h`;

  // Días de calendario (no bloques de 24 h): algo de anoche a las 23 visto
  // hoy a las 8 es "Ayer", aunque no hayan pasado 24 h.
  const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const inicioFecha = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const dias = Math.round((inicioHoy.getTime() - inicioFecha.getTime()) / 86400000);
  if (dias <= 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}`;
}
