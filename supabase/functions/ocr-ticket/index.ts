// RF4 — Foto de un ticket de compra -> lista de productos candidatos.
// Proveedor: OCR.space (ver decisión en docs/plan-de-testing.md, Sprint 5).
// Es texto plano con buen contraste, el caso donde un OCR clásico rinde
// bien sin necesitar "entendimiento" de la imagen.
//
// Riesgo R3: si el OCR no llega a un umbral de precisión aceptable, el
// plan B es un modo semi-automático (devolver el texto crudo para que el
// usuario complete a mano en vez de productos ya parseados). Por eso la
// función ya está aislada del resto del sistema: cambiar de proveedor o
// caer al plan B no debería requerir tocar el cliente.
import { corsHeaders } from '../_shared/cors.ts';
import { esProbablementeAlimento } from '../_shared/filtroNoAlimentos.ts';
import { parsearTicket } from '../_shared/ticket.ts';

async function extraerTextoConOcrSpace(imagenBase64: string, apiKey: string): Promise<string> {
  const body = new URLSearchParams();
  body.set('apikey', apiKey);
  body.set('base64Image', `data:image/jpeg;base64,${imagenBase64}`);
  body.set('language', 'spa');
  body.set('OCREngine', '2');
  body.set('scale', 'true');

  const respuesta = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!respuesta.ok) {
    throw new Error(`OCR.space respondió ${respuesta.status}`);
  }

  const data = await respuesta.json();
  if (data.IsErroredOnProcessing) {
    throw new Error(data.ErrorMessage?.join?.(', ') ?? 'Error desconocido de OCR.space');
  }

  return data.ParsedResults?.[0]?.ParsedText ?? '';
}

Deno.serve(async (req: Request) => {
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

  const apiKey = Deno.env.get('OCR_SPACE_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'OCR_SPACE_KEY no configurada en los secrets de la función.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let textoDetectado: string;
  try {
    textoDetectado = await extraerTextoConOcrSpace(imagen, apiKey);
  } catch (error) {
    // Plan B del riesgo R3: no romper el flujo, devolver lista vacía con
    // el motivo. El cliente ya maneja "ticket ilegible" mostrando un
    // mensaje y permitiendo carga manual (RF4, Sprint 6).
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error de OCR' }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Aísla el cuerpo del ticket (sin encabezado ni pie), suma repeticiones y
  // anulaciones, y descarta lo que claramente no es comida.
  const productosDetectados = parsearTicket(textoDetectado).filter((producto) => esProbablementeAlimento(producto.nombre));

  // Diagnóstico: si salieron pocos productos, queda en los logs de la
  // función (solo del proyecto) lo que leyó el OCR para poder ajustar el parser.
  if (productosDetectados.length < 2) {
    console.log('[ocr-ticket] pocos productos. Texto del OCR:', textoDetectado.slice(0, 2000));
  }

  return new Response(JSON.stringify(productosDetectados), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
