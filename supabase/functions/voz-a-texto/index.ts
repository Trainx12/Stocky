// RF8 — Audio grabado por el usuario -> comando de ABM de productos por
// voz. Proveedor previsto: Google Speech-to-Text (transcripción) +
// interpretación por IA del texto resultante (alta/baja/modificación de
// producto). Evaluación en sprint 7, integración en sprint 7/8.
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // Preflight de CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { audio } = await req.json();

  if (!audio) {
    return new Response(JSON.stringify({ error: 'Falta el audio (base64).' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // TODO (sprint 7/8): transcribir con
  // Deno.env.get('GOOGLE_SPEECH_TO_TEXT_KEY'), interpretar la acción
  // (alta/baja/modificación) y el producto mencionado.
  const resultado = null;

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
