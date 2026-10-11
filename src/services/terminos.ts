import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { VERSION_TERMINOS } from '../legal/terminos';
import type { Usuario } from '../types/database';

/**
 * Aceptación de los Términos y Condiciones (texto en src/legal/terminos.ts).
 *
 * Se aceptan en dos momentos posibles:
 *   1. Antes de loguearse, después del onboarding: todavía no hay usuario
 *      en la base, así que se guarda en el celular que se aceptó esta
 *      versión (AsyncStorage) y, apenas inicia sesión, se registra en la
 *      base (`registrarAceptacionPendiente`).
 *   2. Ya logueado, si la versión aceptada no es la vigente (usuarios que ya
 *      existían, o cuando se publica una versión nueva): RootNavigator
 *      muestra los términos y no deja entrar hasta aceptarlos.
 *
 * La constancia real es la de la base: usuarios.terminos_version y
 * terminos_aceptados_at, que fija la RPC con la hora del servidor.
 */

const CLAVE_ACEPTACION_LOCAL = 'stocky.terminosAceptados';

// true si la cuenta todavía no aceptó la versión vigente. Mientras el
// perfil no cargó (`usuario` null) no se decide nada (no se muestra nada).
export function necesitaAceptarTerminos(
  usuario: Pick<Usuario, 'terminos_version'> | null,
  versionVigente: string = VERSION_TERMINOS,
): boolean {
  return usuario !== null && usuario.terminos_version !== versionVigente;
}

// Registra en la base que el usuario logueado aceptó esta versión.
export async function aceptarTerminos(version: string = VERSION_TERMINOS): Promise<void> {
  const { error } = await supabase.rpc('aceptar_terminos', { p_version: version });
  if (error) throw error;
}

// Antes de loguearse: deja anotado en el celular que se aceptó esta versión.
export async function guardarAceptacionLocal(version: string = VERSION_TERMINOS): Promise<void> {
  await AsyncStorage.setItem(CLAVE_ACEPTACION_LOCAL, version);
}

// Después de loguearse: si en este celular se aceptó la versión vigente
// antes del login, la registra en la base y limpia la marca local. Devuelve
// true si registró algo (para que el caller recargue el perfil). Si falla
// (sin red), no rompe nada: se le mostrarán los términos para aceptar.
export async function registrarAceptacionPendiente(version: string = VERSION_TERMINOS): Promise<boolean> {
  try {
    const local = await AsyncStorage.getItem(CLAVE_ACEPTACION_LOCAL);
    if (local !== version) return false;
    await aceptarTerminos(version);
    await AsyncStorage.removeItem(CLAVE_ACEPTACION_LOCAL);
    return true;
  } catch (err) {
    console.warn('[Stocky] No se pudo registrar la aceptación de los términos:', err);
    return false;
  }
}
