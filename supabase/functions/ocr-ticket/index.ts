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

interface ProductoDetectado {
  nombre: string;
  cantidad?: number;
  unidad?: string;
}

// Líneas de ticket que nunca son un producto (totales, medios de pago,
// datos fiscales, etc.) — se descartan antes de intentar parsearlas.
const LINEAS_A_IGNORAR = [
  /^total/i,
  /^subtotal/i,
  /^importe/i,
  /^efectivo/i,
  /^vuelto/i,
  /^cambio/i,
  /^cuit/i,
  /^iva/i,
  /^gracias/i,
  /^fecha/i,
  /^hora/i,
  /^caja/i,
  /^tarjeta/i,
  /^n[uú]mero/i,
  /^comprobante/i,
  /^\*+$/,
  /^-+$/,
  /^[\d.,\s]+$/, // línea de solo números (precio/código de barras suelto)
];

const UNIDADES_CONOCIDAS = ['kg', 'g', 'gr', 'l', 'lt', 'ml', 'un', 'unid', 'cc'];

function parsearLinea(linea: string): ProductoDetectado | null {
  const texto = linea.trim();
  if (texto.length < 2) return null;
  if (LINEAS_A_IGNORAR.some((patron) => patron.test(texto))) return null;

  // Patrones típicos de ticket argentino: "2 ARROZ 1KG", "ARROZ 1KG x2",
  // "ARROZ GALLO 1KG". Se intenta extraer cantidad y unidad si aparecen;
  // si no, se usa la línea completa como nombre.
  let cantidad: number | undefined;
  let unidad: string | undefined;
  let nombre = texto;

  const cantidadAlInicio = texto.match(/^(\d+(?:[.,]\d+)?)\s*[xX]?\s+(.+)/);
  const cantidadAlFinal = texto.match(/^(.+?)\s*[xX]\s*(\d+(?:[.,]\d+)?)$/);

  if (cantidadAlInicio) {
    cantidad = parseFloat(cantidadAlInicio[1].replace(',', '.'));
    nombre = cantidadAlInicio[2];
  } else if (cantidadAlFinal) {
    nombre = cantidadAlFinal[1];
    cantidad = parseFloat(cantidadAlFinal[2].replace(',', '.'));
  }

  const matchUnidad = nombre.match(
    new RegExp(`\\b(\\d+(?:[.,]\\d+)?)\\s*(${UNIDADES_CONOCIDAS.join('|')})\\b`, 'i')
  );
  if (matchUnidad) {
    unidad = matchUnidad[2].toLowerCase();
    if (cantidad === undefined) cantidad = parseFloat(matchUnidad[1].replace(',', '.'));
  }

  nombre = nombre.trim();
  if (nombre.length < 2 || !/[a-zA-Z]/.test(nombre)) return null;

  return { nombre, cantidad, unidad };
}

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

  const productosDetectados: ProductoDetectado[] = textoDetectado
    .split('\n')
    .map(parsearLinea)
    .filter((producto): producto is ProductoDetectado => producto !== null)
    .filter((producto) => esProbablementeAlimento(producto.nombre));

  return new Response(JSON.stringify(productosDetectados), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
