// RF4 — Foto de un ticket de compra -> lista de productos candidatos.
// Proveedor previsto: Google Cloud Vision (OCR) + parseo de líneas de
// ticket. La evaluación de APIs de OCR es sprint 5; la integración real,
// sprint 6 (ver plan de 10 sprints). Este stub solo deja el contrato de
// entrada/salida acordado con services/externalApis.ts.
//
// Riesgo R3: si el OCR no llega a un umbral de precisión aceptable, el
// plan B es un modo semi-automático (devolver el texto crudo para que el
// usuario complete a mano en vez de productos ya parseados). Por eso la
// función ya está aislada del resto del sistema: cambiar de proveedor o
// caer al plan B no debería requerir tocar el cliente.
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // El navegador manda un OPTIONS antes del POST real (preflight de CORS).
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { imagen } = await req.json();

  if (!imagen) {
    return new Response(JSON.stringify({ error: 'Falta la imagen del ticket (base64).' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // TODO (sprint 6): llamar a Google Cloud Vision con
  // Deno.env.get('GOOGLE_CLOUD_VISION_KEY'), parsear el texto detectado a
  // productos candidatos y devolverlos.
  const productosDetectados: Array<{ nombre: string; cantidad?: number; unidad?: string }> = [];

  return new Response(JSON.stringify(productosDetectados), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
