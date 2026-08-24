import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

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
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Supabase no devolvió una URL de autenticación de Google.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !result.url) {
    throw new Error('El login con Google fue cancelado o no se completó.');
  }

  // Supabase devuelve los tokens en el fragment de la URL
  // (`stocky://auth/callback#access_token=...&refresh_token=...`), no en
  // el query string, así que `Linking.parse` (pensado para `?query`) no
  // sirve acá: hay que parsear el fragment a mano.
  const fragment = result.url.split('#')[1] ?? '';
  const fragmentParams = new URLSearchParams(fragment);

  const errorDescription = fragmentParams.get('error_description');
  if (errorDescription) throw new Error(errorDescription);

  const accessToken = fragmentParams.get('access_token') ?? undefined;
  const refreshToken = fragmentParams.get('refresh_token') ?? undefined;

  if (!accessToken || !refreshToken) {
    throw new Error('La respuesta de Google no incluyó los tokens de sesión esperados.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) throw sessionError;
  return sessionData.session;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
