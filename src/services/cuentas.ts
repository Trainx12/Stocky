import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

/**
 * Varias cuentas en el mismo celular, como en Instagram (Sprint 10): se
 * inicia sesión con más de una cuenta de Google y se cambia entre ellas desde
 * Cuenta, sin volver a pasar por el login.
 *
 * Supabase maneja UNA sesión activa por vez. Para las demás, se guarda en el
 * celular (AsyncStorage) la última sesión conocida de cada cuenta: sus tokens
 * de acceso y de renovación. Cambiar de cuenta = activar esos tokens con
 * `supabase.auth.setSession` (si el de acceso venció, Supabase lo renueva
 * solo con el de renovación). Es el mismo lugar y el mismo nivel de
 * seguridad con que Supabase ya guarda la sesión activa.
 *
 * AuthContext llama a `recordarSesion` cada vez que cambia o se renueva la
 * sesión activa, así los tokens guardados de esa cuenta están siempre al día.
 */

const CLAVE_CUENTAS = 'stocky.cuentas';

export interface CuentaGuardada {
  userId: string;
  email: string;
  nombre: string | null;
  accessToken: string;
  refreshToken: string;
  // Último uso, para ordenar la lista (la más reciente primero).
  usadaEn: string;
}

// Lo que se ve de una cuenta en la lista (sin los tokens).
export type ResumenCuenta = Omit<CuentaGuardada, 'accessToken' | 'refreshToken'>;

async function leer(): Promise<CuentaGuardada[]> {
  try {
    const texto = await AsyncStorage.getItem(CLAVE_CUENTAS);
    const datos = texto ? JSON.parse(texto) : [];
    return Array.isArray(datos) ? datos : [];
  } catch {
    // Datos corruptos: se empieza de cero en vez de romper el login.
    return [];
  }
}

async function escribir(cuentas: CuentaGuardada[]): Promise<void> {
  await AsyncStorage.setItem(CLAVE_CUENTAS, JSON.stringify(cuentas));
}

// Agrega o actualiza una cuenta en la lista (lógica pura, testeada aparte):
// si ya estaba, se reemplazan sus datos y tokens; la más reciente va primero.
export function upsertCuenta(cuentas: CuentaGuardada[], cuenta: CuentaGuardada): CuentaGuardada[] {
  return [cuenta, ...cuentas.filter((c) => c.userId !== cuenta.userId)];
}

// La cuenta a la que pasar cuando se cierra la sesión de `userIdActual`: la
// usada más recientemente entre las demás, o null si no queda ninguna.
export function siguienteCuenta<T extends { userId: string }>(cuentas: T[], userIdActual: string): T | null {
  return cuentas.find((c) => c.userId !== userIdActual) ?? null;
}

// Guarda (o actualiza) la sesión activa en la lista de cuentas del celular.
export async function recordarSesion(sesion: Session): Promise<void> {
  const metadata = sesion.user.user_metadata as { full_name?: string; name?: string } | undefined;
  const cuenta: CuentaGuardada = {
    userId: sesion.user.id,
    email: sesion.user.email ?? '',
    nombre: metadata?.full_name ?? metadata?.name ?? null,
    accessToken: sesion.access_token,
    refreshToken: sesion.refresh_token,
    usadaEn: new Date().toISOString(),
  };
  await escribir(upsertCuenta(await leer(), cuenta));
}

// Las cuentas guardadas en este celular, la más reciente primero (sin tokens).
export async function listarCuentas(): Promise<ResumenCuenta[]> {
  return (await leer()).map(({ accessToken: _a, refreshToken: _r, ...resumen }) => resumen);
}

// Saca una cuenta de la lista del celular (no cierra sesiones en el servidor).
export async function olvidarCuenta(userId: string): Promise<void> {
  await escribir((await leer()).filter((c) => c.userId !== userId));
}

// Olvida todas las cuentas guardadas.
export async function olvidarTodas(): Promise<void> {
  await AsyncStorage.removeItem(CLAVE_CUENTAS);
}

// Pasa a otra cuenta guardada. Si su sesión ya no sirve (se cerró desde otro
// lado, se borró la cuenta, pasó mucho tiempo), se la saca de la lista y se
// avisa que hay que volver a iniciar sesión con ella.
export async function cambiarACuenta(userId: string): Promise<void> {
  const cuenta = (await leer()).find((c) => c.userId === userId);
  if (!cuenta) throw new Error('Esa cuenta ya no está guardada en este celular.');

  const { error } = await supabase.auth.setSession({
    access_token: cuenta.accessToken,
    refresh_token: cuenta.refreshToken,
  });
  if (error) {
    await olvidarCuenta(userId);
    throw new Error(`La sesión de ${cuenta.email} venció. Agregala de nuevo para volver a entrar.`);
  }
}
