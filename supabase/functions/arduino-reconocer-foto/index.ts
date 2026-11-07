// =============================================================================
// INTEGRACIÓN ARDUINO (temporal) — ver docs/integracion-arduino-temporal.md.
//
// Foto que manda el servidor Node del proyecto esp32_gemini (ESP32-CAM +
// pulsador, ver esp32_gemini/proyecto) -> Gemini clasifica si es un ticket
// de compra o la foto de un producto suelto y, en cualquiera de los dos
// casos, devuelve una lista de productos candidatos. Esos candidatos se
// guardan en `candidatos_arduino` (estado 'pendiente') para que alguien del
// hogar los confirme desde ArduinoCandidatosScreen antes de que se conviertan
// en una fila real de `productos` -- la IA nunca escribe directo en el
// inventario, mismo criterio que ocr-ticket/vencimiento-foto.
//
// Esta función es independiente de ocr-ticket/vencimiento-foto a propósito
// (no las reusa ni las modifica): esos dos stubs son parte de los 10 sprints
// planificados del proyecto (RF4), mientras que esta integración es temporal
// y pensada para borrarse sin tocar ese trabajo. Para eliminarla del todo,
// ver docs/integracion-arduino-temporal.md.
//
// No necesita verificar sesión de usuario (`verify_jwt = false` en
// supabase/config.toml): la llama un dispositivo físico sin login, igual que
// el resto de las Edge Functions de este proyecto reciben la anon key. La
// escritura en la base se hace con la SERVICE_ROLE_KEY (siempre disponible
// como secret automático en toda Edge Function) para poder insertar sin
// depender de que haya un usuario logueado detrás.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.0';
import { corsHeaders } from '../_shared/cors.ts';

interface CandidatoGemini {
  nombre: string;
  marca?: string | null;
  categoria?: string | null;
  unidad?: string | null;
  cantidad?: number | null;
  confianza?: 'alta' | 'media' | 'baja' | null;
}

interface ClasificacionGemini {
  tipo: 'ticket' | 'producto';
  productos: CandidatoGemini[];
}

const PROMPT = `Mirá esta foto y decidí primero si es (a) un TICKET/comprobante
de compra impreso, con varias líneas de productos y precios, o (b) la foto de
UN producto suelto (envase, fruta, verdura, etc., sin ticket de por medio).

Después, listá los productos que encuentres:
- Si es un ticket: un producto candidato por cada línea de compra que puedas
  leer (ignorá totales, impuestos, descuentos y líneas que no sean productos).
- Si es un producto suelto: un solo producto candidato con lo que reconozcas
  del envase/etiqueta (o de la fruta/verdura si no tiene etiqueta).

Respondé ÚNICAMENTE un JSON con este formato exacto:
{"tipo": "ticket" | "producto", "productos": [{"nombre": string, "marca":
string | null, "categoria": string | null, "unidad": string | null,
"cantidad": number, "confianza": "alta" | "media" | "baja"}]}

Si no reconocés ningún producto, devolvé "productos" como lista vacía en vez
de inventar uno. "marca" y "categoria" van en null si no podés leerlos.
"unidad" es una de: unidad, kg, g, l, ml, paquete (default "unidad" si no se
puede determinar). Respondé en español.`;

async function clasificarConGemini(imagenBase64: string, apiKey: string): Promise<ClasificacionGemini> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ inline_data: { mime_type: 'image/jpeg', data: imagenBase64 } }, { text: PROMPT }],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            tipo: { type: 'STRING', enum: ['ticket', 'producto'] },
            productos: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  nombre: { type: 'STRING' },
                  marca: { type: 'STRING', nullable: true },
                  categoria: { type: 'STRING', nullable: true },
                  unidad: { type: 'STRING', nullable: true },
                  cantidad: { type: 'NUMBER' },
                  confianza: { type: 'STRING', enum: ['alta', 'media', 'baja'] },
                },
                required: ['nombre'],
              },
            },
          },
          required: ['tipo', 'productos'],
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
  if (!texto) throw new Error('Gemini no devolvió contenido.');

  return JSON.parse(texto) as ClasificacionGemini;
}

const UNIDADES_VALIDAS = new Set(['unidad', 'kg', 'g', 'l', 'ml', 'paquete']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const { imagen, hogarId } = await req.json();

  if (!imagen) {
    return new Response(JSON.stringify({ error: 'Falta la imagen (base64).' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  if (!hogarId) {
    return new Response(JSON.stringify({ error: 'Falta hogarId.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY no configurada en los secrets de la función.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let clasificacion: ClasificacionGemini;
  try {
    clasificacion = await clasificarConGemini(imagen, apiKey);
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Error de Gemini' }), {
      status: 502,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const productos = clasificacion.productos ?? [];

  if (productos.length > 0) {
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const filas = productos.map((p) => ({
      hogar_id: hogarId,
      tipo: clasificacion.tipo,
      nombre: p.nombre,
      marca: p.marca ?? null,
      categoria: p.categoria ?? null,
      unidad: p.unidad && UNIDADES_VALIDAS.has(p.unidad) ? p.unidad : 'unidad',
      cantidad: p.cantidad ?? 1,
      confianza: p.confianza ?? 'media',
    }));

    const { error } = await supabase.from('candidatos_arduino').insert(filas);
    if (error) {
      return new Response(JSON.stringify({ error: `No se pudieron guardar los candidatos: ${error.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return new Response(JSON.stringify({ tipo: clasificacion.tipo, productos }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
