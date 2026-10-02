// RF2 (complemento) — Foto del envase -> fecha de vencimiento detectada.
// Proveedor: Gemini 2.5 Flash (ver decisión en docs/plan-de-testing.md,
// Sprint 5). Un OCR clásico no distingue la fecha de vencimiento de otros
// números impresos en el envase (lote, código de barras); un modelo de
// visión permite pedir explícitamente "encontrá la fecha de vencimiento"
// en vez de solo extraer texto crudo. El usuario siempre confirma la
// fecha antes de guardarla.
//
// Criterio de aceptación (Sprint 5): el modelo nunca debe devolver una
// fecha con confianza si no está seguro — por eso se le pide explícitamente
// `null` + confianza baja en ese caso, en vez de forzar una respuesta.
import { corsHeaders } from '../_shared/cors.ts';

interface ResultadoVencimiento {
  fecha_vencimiento: string | null;
  confianza?: number;
}

const PROMPT = `Mirá esta foto de un envase de producto y encontrá la fecha de
vencimiento impresa (puede decir "Vto.", "Cons. Pref.", "Best Before",
"EXP", etc.). No confundas la fecha de vencimiento con el lote, el código
de barras o la fecha de elaboración.

Respondé ÚNICAMENTE un JSON con este formato exacto:
{"fecha_vencimiento": "YYYY-MM-DD" | null, "confianza": number entre 0 y 1}

Si no encontrás una fecha de vencimiento o no estás razonablemente
seguro de haberla leído bien, devolvé fecha_vencimiento: null y
confianza baja. Nunca inventes una fecha.`;

async function detectarVencimientoConGemini(
  imagenBase64: string,
  apiKey: string
): Promise<ResultadoVencimiento> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: imagenBase64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            fecha_vencimiento: { type: 'STRING', nullable: true },
            confianza: { type: 'NUMBER' },
          },
          required: ['fecha_vencimiento'],
        },
      },
    }),
  });

  if (!respuesta.ok) {
    const detalle = await respuesta.text();
    throw new Error(`Gemini respondió ${respuesta.status}: ${detalle}`);
  }

  const data = await respuesta.json();
  const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!texto) {
    throw new Error('Gemini no devolvió contenido.');
  }

  const parseado = JSON.parse(texto) as ResultadoVencimiento;
  return {
    fecha_vencimiento: parseado.fecha_vencimiento ?? null,
    confianza: parseado.confianza,
  };
}

Deno.serve(async (req: Request) => {
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

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GEMINI_API_KEY no configurada en los secrets de la función.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let resultado: ResultadoVencimiento;
  try {
    resultado = await detectarVencimientoConGemini(imagen, apiKey);
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error de Gemini' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
