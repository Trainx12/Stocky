import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Preferencias del dashboard que se recuerdan en el dispositivo
 * (AsyncStorage; en la web es el almacenamiento del navegador), por cuenta:
 *
 *   - Hogar que se está usando: el último elegido con "Cambiar hogar". Al
 *     volver a abrir la app o la página se sigue mostrando ese, en vez de
 *     volver siempre al primero.
 *   - Alcance de las alertas del inicio ("Productos próximos a vencer" y
 *     "Stock bajo"): por defecto solo las del hogar que se está usando; con
 *     la opción "Alertas de todos mis hogares" (pantalla Notificaciones) se
 *     juntan las de todos.
 *
 * Se guardan por cuenta (la clave lleva el id del usuario) para que, con
 * varias cuentas en el mismo celular (Cuenta → "Tus cuentas"), cada una
 * tenga las suyas. Es una preferencia local a propósito, como el modo
 * claro/oscuro: no hace falta tocar la base y cada dispositivo puede tener
 * un hogar distinto a mano.
 */

const claveHogar = (usuarioId: string) => `stocky.hogarSeleccionado.${usuarioId}`;
const claveAlertasDeTodos = (usuarioId: string) => `stocky.alertasDeTodosLosHogares.${usuarioId}`;

/** Último hogar elegido por esta cuenta en este dispositivo (null = ninguno). */
export async function leerHogarGuardado(usuarioId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(claveHogar(usuarioId));
  } catch {
    // Sin almacenamiento (modo privado del navegador, etc.): se elige como antes.
    return null;
  }
}

export async function guardarHogarSeleccionado(usuarioId: string, hogarId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(claveHogar(usuarioId), hogarId);
  } catch (err) {
    console.warn('[Stocky] No se pudo recordar el hogar elegido:', err);
  }
}

/** true si la cuenta pidió ver las alertas de todos sus hogares. Por defecto false. */
export async function leerAlertasDeTodos(usuarioId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(claveAlertasDeTodos(usuarioId))) === 'si';
  } catch {
    return false;
  }
}

export async function guardarAlertasDeTodos(usuarioId: string, todos: boolean): Promise<void> {
  await AsyncStorage.setItem(claveAlertasDeTodos(usuarioId), todos ? 'si' : 'no');
}

/**
 * Qué hogar mostrar al entrar, en orden de prioridad:
 *   1. el que se eligió la última vez (si todavía soy miembro);
 *   2. el "hogar activo" de la cuenta (`usuarios.hogar_id`), si soy miembro;
 *   3. el primero de la lista.
 * null si no tengo hogares.
 */
export function elegirHogarInicial(
  misHogarIds: string[],
  guardado: string | null,
  hogarActivo: string | null | undefined,
): string | null {
  if (misHogarIds.length === 0) return null;
  if (guardado && misHogarIds.includes(guardado)) return guardado;
  if (hogarActivo && misHogarIds.includes(hogarActivo)) return hogarActivo;
  return misHogarIds[0];
}

/**
 * Hogares de los que se piden las alertas del inicio: todos si la cuenta lo
 * eligió, si no solo el que se está usando (lista vacía mientras todavía no
 * hay uno elegido).
 */
export function hogaresDeLasAlertas(misHogarIds: string[], seleccionadoId: string | null, todos: boolean): string[] {
  if (todos) return misHogarIds;
  return seleccionadoId && misHogarIds.includes(seleccionadoId) ? [seleccionadoId] : [];
}
