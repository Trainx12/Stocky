// Headers CORS compartidos por las tres Edge Functions: la app llama a
// estas funciones desde el cliente de Expo, así que necesitan permitir
// ese origen. Se ajusta cuando se defina el dominio final de producción.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
