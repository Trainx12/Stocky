import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

/**
 * Variables `EXPO_PUBLIC_*`: Expo las inyecta en el bundle de forma
 * pública en tiempo de build (no son secretas). Por eso acá solo va la
 * URL del proyecto y la anon key, que están pensadas para vivir en el
 * cliente y quedan restringidas por las policies de RLS. Las claves de
 * los proveedores externos (OCR, voz) NUNCA deben leerse acá: viven como
 * secrets de las Edge Functions (ver services/externalApis.ts).
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // No se corta la app con un throw acá: eso rompería el bundle entero
  // (incluida la pantalla de bienvenida) para cualquiera que clone el
  // repo antes de cargar sus propias credenciales. En cambio, se avisa
  // por consola y se usa una URL "placeholder" válida; las llamadas a
  // Supabase (login, queries) van a fallar con un error de red recién
  // cuando efectivamente se usen, que es donde corresponde manejarlas.
  console.warn(
    '[Stocky] Faltan EXPO_PUBLIC_SUPABASE_URL y/o EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env y completá los valores de tu proyecto de Supabase.'
  );
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // En React Native no hay URL de navegador que parsear al volver de un
      // login OAuth; el flujo se resuelve manualmente en services/auth.ts.
      detectSessionInUrl: false,
    },
  }
);
