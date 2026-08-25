// RF2 (complemento) — Foto del envase -> fecha de vencimiento detectada.
// Proveedor previsto: Gemini Flash (lectura de fecha impresa en el
// envase). Evaluación en sprint 5, integración en sprint 6, igual que
// ocr-ticket. El usuario siempre confirma la fecha antes de guardarla.
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  // Preflight de CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { imagen } = await req.json();

  if (!imagen) {
    return new Response(JSON.stringify({ error: 'Falta la imagen del envase (base64).' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // TODO (sprint 6): llamar a Gemini Flash con
  // Deno.env.get('GEMINI_API_KEY') y devolver la fecha detectada.
  const resultado: { fecha_vencimiento: string | null; confianza?: number } = {
    fecha_vencimiento: null,
  };

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
