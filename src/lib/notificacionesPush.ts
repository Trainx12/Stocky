import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { calcularAvisosLocales } from '../services/notificaciones';
import type { Producto } from '../types/database';

/**
 * Notificaciones en el teléfono (Sprint 10), con expo-notifications.
 *
 * Dos caminos, según lo que el celular permita:
 *   1. Push remoto: el celular le pide a Expo un token y lo guarda en
 *      `push_tokens` (RPC registrar_push_token). Cada notificación nueva de
 *      la campanita sale como push desde la base (trigger + pg_net, ver
 *      migración 20261012120000_notificaciones.sql). Llega con la app
 *      cerrada. Necesita el development build de expo.dev (el que usa
 *      el equipo; en Expo Go Android no existe desde el SDK 53) y las
 *      credenciales de Firebase cargadas en EAS -- ver
 *      docs/incidentes-sprint10.md.
 *   2. Plan B, local: si no se pudo obtener el token, los avisos de
 *      vencimiento se programan en el propio celular (llegan con la app
 *      cerrada, pero solo vencimientos: lo que hace otra persona -- una
 *      solicitud, por ejemplo -- solo se ve en la campanita).
 *
 * Con la app abierta, las notificaciones del sistema NO se muestran
 * (setNotificationHandler): la app ya muestra su propio cartelito por
 * Realtime (ver NotificacionesContext) y saldrían dos avisos iguales.
 *
 * En web no hay nada de esto (expo-notifications no soporta web): todas las
 * funciones son no-op ahí.
 */

const CANAL_ANDROID = 'default';

function soportaNotificaciones(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

// Configuración que tiene que correr una vez al arrancar la app (App.tsx).
export async function configurarNotificaciones(): Promise<void> {
  if (!soportaNotificaciones()) return;

  Notifications.setNotificationHandler({
    // Solo se llama con la app en primer plano: se guarda en la bandeja del
    // sistema, pero sin banner ni sonido (el cartelito de la app ya avisa).
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  // Android 8+ exige un canal, y Android 13+ recién muestra el pedido de
  // permiso después de que exista uno (doc de expo-notifications SDK 57).
  // Mismo id que manda el push del servidor (channelId: 'default').
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
      name: 'Avisos de Stocky',
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#7B2FF7',
    });
  }
}

// Pide permiso para notificar (si todavía no se decidió). true si quedó
// concedido.
export async function pedirPermiso(): Promise<boolean> {
  if (!soportaNotificaciones()) return false;
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  if (!actual.canAskAgain) return false;
  const pedido = await Notifications.requestPermissionsAsync();
  return pedido.granted;
}

// true si el permiso de notificaciones ya está concedido (sin pedirlo).
export async function tienePermiso(): Promise<boolean> {
  if (!soportaNotificaciones()) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

// Registra este celular para recibir push de la cuenta logueada. Devuelve
// el token, o null si no se pudo (web, emulador, permiso denegado, o falta
// configurar Firebase: `getExpoPushTokenAsync` falla en ese caso). Nunca
// tira error: sin push la app sigue funcionando con el plan B local.
export async function registrarPush(): Promise<string | null> {
  if (!soportaNotificaciones() || !Device.isDevice) return null;
  try {
    if (!(await pedirPermiso())) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const { error } = await supabase.rpc('registrar_push_token', { p_token: token, p_plataforma: Platform.OS });
    if (error) throw error;
    return token;
  } catch (err) {
    console.warn('[Stocky] No se pudo registrar el celular para notificaciones push:', err);
    return null;
  }
}

// Al cerrar sesión: este celular deja de recibir los push de esa cuenta.
export async function desregistrarPush(token: string | null): Promise<void> {
  if (!token) return;
  const { error } = await supabase.rpc('eliminar_push_token', { p_token: token });
  if (error) console.warn('[Stocky] No se pudo desregistrar el celular:', error.message);
}

// Plan B: reprograma desde cero los avisos locales de vencimiento (se
// borran los anteriores para no duplicar si cambió una fecha).
export async function programarAvisosLocales(productos: Producto[], diasPorDefecto: number): Promise<number> {
  if (!soportaNotificaciones()) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!(await tienePermiso())) return 0;

  const avisos = calcularAvisosLocales(productos, diasPorDefecto);
  for (const aviso of avisos) {
    await Notifications.scheduleNotificationAsync({
      identifier: aviso.id,
      content: { title: aviso.titulo, body: aviso.mensaje, data: { tipo: 'por_vencer' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: aviso.fecha, channelId: CANAL_ANDROID },
    });
  }
  return avisos.length;
}

// Al tocar una notificación del sistema (con la app cerrada o en segundo
// plano), la app se abre; esto avisa para poder llevar a la campanita.
export function escucharToquesDeNotificacion(alTocar: () => void): () => void {
  if (!soportaNotificaciones()) return () => {};
  const suscripcion = Notifications.addNotificationResponseReceivedListener(() => alTocar());
  return () => suscripcion.remove();
}
