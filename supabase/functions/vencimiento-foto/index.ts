// RF2 (complemento) — Foto del envase -> fecha de vencimiento detectada.
// Proveedor: Gemini Flash (varios modelos con respaldo, ver MODELOS_POR_DEFECTO) (ver decisión en docs/plan-de-testing.md,
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

// Modelos a probar en orden. Google satura o retira modelos Flash seguido
// (503 "high demand", 404 "ya no disponible"), así que si el primero falla por
// eso se pasa al siguiente. Se puede cambiar sin tocar código con el secret
// GEMINI_MODEL (lista separada por comas, ej: "gemini-3.8-flash,gemini-3.5-flash").
const MODELOS_POR_DEFECTO = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const ESTADOS_REINTENTABLES = [404, 429, 500, 503];
// Tiempo máximo por intento: un modelo lento o saturado no puede colgar la
// pantalla (en pruebas llegó a tardar ~80 s en un modelo de respaldo).
const TIMEOUT_POR_INTENTO_MS = 15_000;

class ErrorGemini extends Error {
  constructor(public estado: number, detalle: string) {
    super(`Gemini respondió ${estado}: ${detalle}`);
  }
}

async function consultarGemini(
  modelo: string,
  imagenBase64: string,
  apiKey: string,
  pensamientoMinimo: boolean
): Promise<ResultadoVencimiento> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  const respuesta = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_POR_INTENTO_MS),
    // La key va en header (no en la URL): así no queda en ningún log y
    // funciona con todos los formatos de key de AI Studio.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
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
        // Leer una fecha no necesita razonar: con el nivel por defecto
        // ("medium") los modelos 3.x tardaban decenas de segundos.
        ...(pensamientoMinimo ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
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
    throw new ErrorGemini(respuesta.status, await respuesta.text());
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

async function detectarVencimientoConGemini(imagenBase64: string, apiKey: string): Promise<ResultadoVencimiento> {
  const configurados = (Deno.env.get('GEMINI_MODEL') ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const modelos = configurados.length > 0 ? configurados : MODELOS_POR_DEFECTO;

  let ultimoError: unknown = new Error('No hay modelos configurados.');
  for (const modelo of modelos) {
    try {
      try {
        return await consultarGemini(modelo, imagenBase64, apiKey, true);
      } catch (error) {
        // Si el modelo no acepta el nivel de pensamiento (400), se prueba el
        // mismo modelo con su configuración por defecto.
        if (error instanceof ErrorGemini && error.estado === 400) {
          return await consultarGemini(modelo, imagenBase64, apiKey, false);
        }
        throw error;
      }
    } catch (error) {
      ultimoError = error;
      console.error(`[vencimiento-foto] ${modelo}:`, error instanceof Error ? error.message : error);
      const esTimeout = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
      const esReintentable = error instanceof ErrorGemini && ESTADOS_REINTENTABLES.includes(error.estado);
      // Saturado, sin cuota, retirado o lento: no se insiste con el mismo
      // modelo (un 503 ya tarda varios segundos en responder), se pasa al
      // siguiente. Cualquier otro error es real y se corta acá.
      if (!esTimeout && !esReintentable) throw error;
    }
  }
  throw ultimoError;
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
    // El detalle técnico queda en los logs de la función; al usuario le
    // llega un mensaje entendible (y la salida es cargar la fecha a mano).
    console.error('[vencimiento-foto]', error instanceof Error ? error.message : error);
    return new Response(
      JSON.stringify({ error: 'No pudimos leer la fecha en este momento. Ingresala a mano.' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(JSON.stringify(resultado), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
