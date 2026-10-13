// "¿Qué cocino con esto?" — productos de la despensa que están por vencer ->
// 2 o 3 recetas simples que los usen. Proveedor: Gemini (misma key y mismos
// modelos de respaldo que voz-a-texto y vencimiento-foto, ver
// _shared/gemini.ts). Nunca guarda nada: la app solo muestra las recetas.
import { corsHeaders } from '../_shared/cors.ts';
import { consultarGemini } from '../_shared/gemini.ts';

interface Ingrediente {
  nombre: string;
  cantidad?: number;
  unidad?: string;
  vence?: string | null;
}

const MAX_INGREDIENTES = 15;

const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    recetas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          titulo: { type: 'STRING' },
          minutos: { type: 'NUMBER', nullable: true },
          usa: { type: 'ARRAY', items: { type: 'STRING' } },
          ademas: { type: 'ARRAY', items: { type: 'STRING' } },
          pasos: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['titulo', 'minutos', 'usa', 'ademas', 'pasos'],
        propertyOrdering: ['titulo', 'minutos', 'usa', 'ademas', 'pasos'],
      },
    },
  },
  required: ['recetas'],
};

function prompt(ingredientes: Ingrediente[]): string {
  const lista = ingredientes
    .map((i) => `- ${i.nombre}${i.cantidad ? ` (${i.cantidad} ${i.unidad ?? ''})` : ''}${i.vence ? `, vence ${i.vence}` : ''}`)
    .join('\n');
  return `Sos el asistente de cocina de Stocky, una app argentina para no
desperdiciar comida. Estos productos de la despensa están por vencer:

${lista}

Proponé entre 2 y 3 recetas caseras, simples y realistas (cocina argentina de
todos los días) que aprovechen la mayor cantidad posible de esos productos,
priorizando los que vencen antes. Respondé ÚNICAMENTE el JSON pedido:
- "titulo": nombre corto de la receta.
- "minutos": tiempo aproximado total, o null.
- "usa": qué productos de la lista usa (con el mismo nombre de la lista).
- "ademas": otros ingredientes necesarios, solo cosas básicas (sal, aceite,
  harina, huevos...). Lo menos posible.
- "pasos": entre 3 y 6 pasos cortos, en español rioplatense ("cortá",
  "mezclá").
Si algo de la lista no es comida, ignoralo. No inventes productos que no
estén en la lista como si los tuviera.`;
}

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respuestaJson({ error: 'El pedido no es un JSON válido.' }, 400);
  }

  const ingredientes = (Array.isArray(body.ingredientes) ? body.ingredientes : [])
    .filter((i): i is Ingrediente => typeof i?.nombre === 'string' && i.nombre.trim() !== '')
    .map((i) => ({ ...i, nombre: i.nombre.trim().slice(0, 60) }))
    .slice(0, MAX_INGREDIENTES);

  if (ingredientes.length === 0) {
    return respuestaJson({ error: 'No hay productos por vencer para armar recetas.' }, 400);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return respuestaJson({ error: 'GEMINI_API_KEY no configurada en los secrets de la función.' }, 500);
  }

  try {
    const resultado = await consultarGemini<{ recetas: unknown[] }>([{ text: prompt(ingredientes) }], ESQUEMA, apiKey, 'recetas');
    return respuestaJson({ recetas: Array.isArray(resultado.recetas) ? resultado.recetas : [] });
  } catch (error) {
    console.error('[recetas]', error instanceof Error ? error.message : error);
    return respuestaJson({ error: 'No pudimos pensar recetas en este momento. Probá de nuevo en un rato.' }, 502);
  }
});
