import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { cambiarACuenta, olvidarCuenta, olvidarTodas, siguienteCuenta, listarCuentas } from './cuentas';
import { borrarMisFotosDePerfil } from './avatar';

// Cierra cualquier sesión de auth-session pendiente al recargar la app en desarrollo.
WebBrowser.maybeCompleteAuthSession();

/**
 * RF1 — Registro/login mediante cuenta de Google.
 *
 * Supabase no puede abrir el navegador del sistema por sí solo en una app
 * nativa, así que el flujo es:
 *   1. Pedirle a Supabase la URL de autorización de Google (sin redirigir).
 *   2. Abrirla nosotros con expo-web-browser en una pestaña de auth.
 *   3. Cuando Google redirige de vuelta a nuestro deep link (`stocky://`),
 *      extraer los tokens de la URL y setear la sesión manualmente, porque
 *      `detectSessionInUrl` está apagado (no aplica en RN).
 *
 * El proveedor "Google" en sí (client id/secret de OAuth) se configura
 * después desde el dashboard de Supabase (Authentication > Providers);
 * este flujo ya queda listo para ese momento.
 */
export async function signInWithGoogle() {
  // A dónde tiene que volver el navegador cuando termine el login.
  const redirectTo = Linking.createURL('auth/callback');

  // Web: la misma pestaña va a Google y vuelve, sin ventana emergente.
  // Antes se usaba una ventana emergente (openAuthSessionAsync) que tenía que
  // devolverle la sesión a la pestaña original y cerrarse sola; Google corta
  // el vínculo entre las dos ventanas, así que la emergente no se cerraba y
  // cargaba la app entera sin sesión: quedaba en la bienvenida/los términos
  // sin poder salir, y en el iPhone (donde la emergente es otra pestaña) uno
  // quedaba atrapado ahí (incidentes-sprint10.md #23). Al volver, supabase-js
  // toma la sesión de la URL (`detectSessionInUrl` en lib/supabase.ts) y
  // AuthContext se entera solo.
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return null; // la página ya se está yendo a Google
  }

  // Paso 1: le pedimos a Supabase la URL de Google, sin que intente
  // redirigir solo (skipBrowserRedirect) porque acá lo abrimos nosotros.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      // Que Google siempre pregunte con qué cuenta entrar: sin esto entra
      // directo con la última usada y no se podría agregar otra cuenta
      // (varias cuentas, ver services/cuentas.ts).
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Supabase no devolvió una URL de autenticación de Google.');

  // Paso 2: abrimos esa URL en una pestaña de navegador dentro de la app,
  // y esperamos a que redirija de vuelta a `redirectTo`.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    throw new Error('El login con Google fue cancelado o no se completó.');
  }

  // Paso 3: sacar los tokens de la URL de vuelta. Supabase los manda en
  // el fragment (`stocky://auth/callback#access_token=...&refresh_token=...`),
  // no en el query string, así que `Linking.parse` (pensado para `?query`)
  // no sirve acá: hay que parsear el fragment a mano.
  const fragment = result.url.split('#')[1] ?? '';
  const fragmentParams = new URLSearchParams(fragment);

  const errorDescription = fragmentParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = fragmentParams.get('access_token') ?? undefined;
  const refreshToken = fragmentParams.get('refresh_token') ?? undefined;

  if (!accessToken || !refreshToken) {
    throw new Error('La respuesta de Google no incluyó los tokens de sesión esperados.');
  }

  // Paso 4: con los tokens en mano, activamos la sesión de verdad en el
  // cliente de Supabase. A partir de acá, AuthContext se entera solo
  // (escucha los cambios de sesión) y actualiza toda la app.
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) throw sessionError;
  return sessionData.session;
}

// Tareas que tienen que correr ANTES de cerrar la sesión, mientras todavía
// hay un usuario autenticado (por ejemplo, desregistrar este celular de los
// push de la cuenta: después del signOut la RPC ya no sabría de quién es).
// Se registran desde afuera (NotificacionesContext) para que este archivo no
// dependa de módulos nativos.
const tareasAntesDeCerrarSesion = new Set<() => Promise<void>>();

export function registrarTareaAntesDeCerrarSesion(tarea: () => Promise<void>): () => void {
  tareasAntesDeCerrarSesion.add(tarea);
  return () => {
    tareasAntesDeCerrarSesion.delete(tarea);
  };
}

// Corre las tareas previas al cierre de sesión. Si alguna falla, se cierra
// la sesión igual: salir de la cuenta nunca puede quedar trabado por un
// detalle secundario.
async function correrTareasPrevias(): Promise<void> {
  await Promise.all(
    Array.from(tareasAntesDeCerrarSesion).map((tarea) =>
      tarea().catch((err) => console.warn('[Stocky] Falló una tarea previa al cierre de sesión:', err)),
    ),
  );
}

// Cierra la sesión de la cuenta ACTIVA en este celular (`scope: 'local'`: no
// la cierra en los otros dispositivos de esa persona) y la saca de la lista
// de cuentas guardadas. Si en el celular quedan otras cuentas, pasa a la
// usada más recientemente, como Instagram; si no, vuelve a la bienvenida.
export async function signOut() {
  await correrTareasPrevias();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) throw error;

  if (!userId) return;
  await olvidarCuenta(userId);
  const siguiente = siguienteCuenta(await listarCuentas(), userId);
  if (siguiente) {
    try {
      await cambiarACuenta(siguiente.userId);
    } catch (err) {
      // Si la otra cuenta ya no sirve, se queda en la bienvenida (no rompe).
      console.warn('[Stocky] No se pudo pasar a la siguiente cuenta:', err);
    }
  }
}

// Cierra la sesión activa y olvida TODAS las cuentas guardadas en este celular.
export async function cerrarTodasLasSesiones() {
  await correrTareasPrevias();
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  await olvidarTodas();
  if (error) throw error;
}

/**
 * Borra la cuenta del usuario logueado para siempre (RPC eliminar_mi_cuenta:
 * sale de sus hogares pasando el rol de dueño a otro miembro, borra los
 * hogares que quedan vacíos y el usuario de Auth), con su foto de perfil
 * (services/avatar.ts). Después cierra la sesión
 * en este celular, la olvida de "Tus cuentas" y, si había otra cuenta
 * guardada, pasa a esa (igual que signOut).
 */
export async function eliminarMiCuenta() {
  // Desregistra este celular de los push mientras la sesión sigue viva.
  await correrTareasPrevias();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;

  // La foto de perfil se borra antes que la cuenta (después ya no habría
  // permiso sobre la carpeta, y Supabase no deja borrarla desde SQL). Si
  // falla, no se sigue: no queda una foto pública de una cuenta borrada.
  if (userId) await borrarMisFotosDePerfil(userId);

  const { error } = await supabase.rpc('eliminar_mi_cuenta');
  if (error) throw error;

  // El usuario ya no existe en Auth: el signOut del servidor puede fallar,
  // pero el local igual limpia la sesión guardada en el celular.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);

  if (!userId) return;
  await olvidarCuenta(userId);
  const siguiente = siguienteCuenta(await listarCuentas(), userId);
  if (siguiente) {
    try {
      await cambiarACuenta(siguiente.userId);
    } catch (err) {
      console.warn('[Stocky] No se pudo pasar a la siguiente cuenta:', err);
    }
  }
}
