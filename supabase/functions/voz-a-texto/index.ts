// RF8 — Audio grabado por el usuario -> comando de ABM de productos (o solo
// una fecha de vencimiento dictada). Proveedor: Gemini (Sprint 8). El audio
// va directo al modelo, que transcribe e interpreta en una sola llamada: con
// el free tier (pocas requests por día) no conviene gastar dos llamadas por
// comando (una de speech-to-text y otra para entender el texto).
//
// Nunca guarda nada: devuelve la transcripción y las acciones interpretadas,
// y la app las muestra para que el usuario las revise y confirme (mismo
// criterio que el OCR del ticket, docs/plan-de-testing.md Sprint 7).
//
// Modos:
//   - 'comando' (default): "agregá 2 leches que vencen el 15 de noviembre",
//     "sacá el yogur", "la manteca vence el viernes". Recibe el inventario del
//     hogar para poder decir a QUÉ producto existente se refiere la baja o la
//     modificación (producto_id).
//   - 'fecha': solo una fecha de vencimiento dictada, para el campo de fecha
//     del formulario de producto.
import { corsHeaders } from '../_shared/cors.ts';
import { consultarGemini, esReintentable } from '../_shared/gemini.ts';

interface ProductoInventario {
  id: string;
  nombre: string;
  marca?: string | null;
  cantidad?: number;
  unidad?: string;
  fecha_vencimiento?: string | null;
}

// Audio de ~30 s en los formatos que graba la app pesa bastante menos que
// esto; el límite evita mandarle a Gemini cualquier cosa enorme.
const MAX_AUDIO_BASE64 = 8 * 1024 * 1024;
const MAX_PRODUCTOS = 300;

const UNIDADES = ['unidad', 'kg', 'g', 'l', 'ml', 'paquete'];
// Para lo que no está en el catálogo: las categorías del catálogo (solo
// alimentos) y dos más para lo que no es comida.
const CATEGORIAS = ['Lácteos', 'Verduras y frutas', 'Panadería', 'Bebidas', 'Infusiones', 'Snacks', 'Otros', 'Limpieza', 'Higiene'];

const ESQUEMA_COMANDO = {
  type: 'OBJECT',
  properties: {
    transcripcion: { type: 'STRING' },
    acciones: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          accion: { type: 'STRING', enum: ['alta', 'baja', 'modificacion'] },
          producto_id: { type: 'STRING', nullable: true },
          nombre: { type: 'STRING' },
          marca: { type: 'STRING', nullable: true },
          cantidad: { type: 'NUMBER', nullable: true },
          unidad: { type: 'STRING', nullable: true, enum: UNIDADES },
          operacion_cantidad: { type: 'STRING', nullable: true, enum: ['fijar', 'sumar', 'restar'] },
          fecha_vencimiento: { type: 'STRING', nullable: true },
          es_alimento: { type: 'BOOLEAN', nullable: true },
          categoria: { type: 'STRING', nullable: true, enum: CATEGORIAS },
        },
        // Todos obligatorios (aunque puedan ser null): si son opcionales, el
        // modelo tiende a omitirlos y se perdían la fecha dicha o el "restar"
        // de "usé 3 huevos" (ver docs/incidentes-sprint8.md #9).
        required: [
          'accion', 'producto_id', 'nombre', 'marca', 'cantidad', 'unidad', 'operacion_cantidad', 'fecha_vencimiento',
          'es_alimento', 'categoria',
        ],
        propertyOrdering: [
          'accion', 'producto_id', 'nombre', 'marca', 'cantidad', 'unidad', 'operacion_cantidad', 'fecha_vencimiento',
          'es_alimento', 'categoria',
        ],
      },
    },
  },
  required: ['transcripcion', 'acciones'],
  propertyOrdering: ['transcripcion', 'acciones'],
};

const ESQUEMA_FECHA = {
  type: 'OBJECT',
  properties: {
    transcripcion: { type: 'STRING' },
    fecha_vencimiento: { type: 'STRING', nullable: true },
    confianza: { type: 'NUMBER' },
  },
  required: ['transcripcion', 'fecha_vencimiento'],
};

const REGLAS_FECHAS = `Fechas: hoy es {HOY} (formato AAAA-MM-DD, zona horaria de Argentina).
Convertí cualquier fecha dicha a AAAA-MM-DD. Si dicen día y mes sin año
("el 15 de noviembre", "15 del 11"), usá la próxima vez que caiga esa fecha a
partir de hoy (si ya pasó este año, el año que viene). Resolvé fechas
relativas ("mañana", "el viernes", "en una semana", "a fin de mes") contra
hoy. Si dicen solo mes y año ("vence en marzo del 27"), usá el último día de
ese mes. Nunca inventes una fecha que no se dijo.`;

function promptComando(hoy: string, productos: ProductoInventario[]): string {
  const inventario =
    productos.length === 0
      ? '(el hogar todavía no tiene productos)'
      : productos
          .map((p) =>
            JSON.stringify({
              id: p.id,
              nombre: p.nombre,
              marca: p.marca ?? null,
              cantidad: p.cantidad,
              unidad: p.unidad,
              vence: p.fecha_vencimiento ?? null,
            })
          )
          .join('\n');

  return `Sos el asistente de voz de Stocky, una app argentina para llevar el
inventario de la despensa de un hogar. Escuchá el audio (español rioplatense)
y respondé ÚNICAMENTE el JSON pedido.

1. "transcripcion": lo que dijo la persona, tal cual.
2. "acciones": una por cada producto que la persona pidió cambiar, en orden.
   - "alta": incorporar un producto ("agregá", "compré", "sumá", "cargá",
     "tengo 2 leches"). Usala aunque el producto ya exista en el inventario:
     la app se encarga de juntarlo con el existente. producto_id = null.
   - "baja": eliminar del inventario un producto existente ("eliminá",
     "borrá", "sacá de la lista", "ya no tengo yogur", "se terminó el
     yogur").
   - "modificacion": cambiar un producto existente. Para cantidad usá
     operacion_cantidad: "restar" si consumió o sacó una cantidad ("usé 2
     huevos", "sacá una leche", "me tomé un yogur"), "sumar" si agrega a uno
     existente indicándolo explícitamente ("sumale 3 a los huevos"), "fijar"
     si dice cuánto queda ("quedan 3 huevos", "poné la leche en 2"). También
     para cargar o cambiar la fecha de vencimiento ("la manteca vence el 20")
     o la marca. Si no cambia la cantidad, cantidad y operacion_cantidad van
     en null.
   - Diferencia clave: "sacá la leche" (sin cantidad) es baja; "sacá UNA
     leche" o "sacá 2 leches" es modificacion con operacion "restar".
   - Para baja y modificacion, producto_id es el "id" del producto del
     inventario al que se refiere (por nombre y, si hay varios, por marca o
     vencimiento). Si no está en el inventario o hay varios y no se puede
     saber cuál, producto_id = null.
   - "nombre": el producto en singular y con mayúscula inicial, sin la marca
     ni la cantidad ("Leche", "Fideos", "Huevo"). En baja/modificación,
     el nombre del producto del inventario.
   - "marca": solo si la dijo ("leche La Serenísima" -> "La Serenísima").
   - "cantidad": número (acepta decimales: "medio kilo" = 0.5 con unidad kg,
     "una docena de huevos" = 12). En alta, null si no dijo cantidad.
   - "unidad": una de ${UNIDADES.join(', ')}, según lo que DIJO la persona,
     aunque el producto se suela medir de otra forma. Peso o volumen:
     "2 kilos de papa" -> kg 2, "un litro y medio de leche" -> l 1.5, "200
     gramos de queso" -> g 200. Envases: "paquete", "caja", "bolsa",
     "sobre", "frasco", "cajita" -> paquete con la cantidad de envases ("un
     paquete de sal" -> paquete 1, "2 cajas de chocolatada" -> paquete 2,
     "un sobre de pimentón" -> paquete 1). Envases sueltos que se cuentan
     ("una botella de aceite", "3 latas de atún") -> unidad. null si no dijo
     ni unidad ni envase ("2 leches").
   - "es_alimento" (solo en alta; en baja/modificación null): true si es
     comida o bebida; false si no lo es (shampoo, jabón, detergente, lavandina,
     papel higiénico, pañales, pilas, comida de mascotas). Igual incluí la
     acción: la app le avisa a la persona y ella decide si lo carga.
   - "categoria" (solo en alta; en baja/modificación null): una de
     ${CATEGORIAS.join(', ')}. Para lo que no es comida: Limpieza o Higiene
     (u Otros si no es ninguna).
   - "fecha_vencimiento": AAAA-MM-DD si la dijo, si no null.
   - Revisá cada acción antes de responder: si la persona dijo una fecha
     para ese producto, fecha_vencimiento NO puede ser null; si una
     modificación tiene cantidad, operacion_cantidad NO puede ser null.
3. Si el audio no se entiende, está vacío o no habla de productos para
   agregar, sacar o cambiar, devolvé "acciones": [] (nunca adivines ni
   inventes productos). Un producto que no es comida (shampoo, detergente)
   SÍ es una acción válida, con es_alimento false.

Ejemplo (si hoy fuera 2026-10-05 y el inventario tuviera huevos con id
"h1" y yogur con id "y1"): "agregá dos leches La Serenísima que vencen el 15
de noviembre, usé tres huevos y eliminá el yogur" ->
{"transcripcion": "...", "acciones": [
 {"accion": "alta", "producto_id": null, "nombre": "Leche", "marca": "La Serenísima", "cantidad": 2, "unidad": null, "operacion_cantidad": null, "fecha_vencimiento": "2026-11-15", "es_alimento": true, "categoria": "Lácteos"},
 {"accion": "modificacion", "producto_id": "h1", "nombre": "Huevo", "marca": null, "cantidad": 3, "unidad": null, "operacion_cantidad": "restar", "fecha_vencimiento": null, "es_alimento": null, "categoria": null},
 {"accion": "baja", "producto_id": "y1", "nombre": "Yogur", "marca": null, "cantidad": null, "unidad": null, "operacion_cantidad": null, "fecha_vencimiento": null, "es_alimento": null, "categoria": null}
]}

Otro ejemplo: "compré un paquete de sal, dos cajas de chocolatada y un
shampoo" ->
{"transcripcion": "...", "acciones": [
 {"accion": "alta", "producto_id": null, "nombre": "Sal", "marca": null, "cantidad": 1, "unidad": "paquete", "operacion_cantidad": null, "fecha_vencimiento": null, "es_alimento": true, "categoria": "Otros"},
 {"accion": "alta", "producto_id": null, "nombre": "Chocolatada", "marca": null, "cantidad": 2, "unidad": "paquete", "operacion_cantidad": null, "fecha_vencimiento": null, "es_alimento": true, "categoria": "Lácteos"},
 {"accion": "alta", "producto_id": null, "nombre": "Shampoo", "marca": null, "cantidad": 1, "unidad": "unidad", "operacion_cantidad": null, "fecha_vencimiento": null, "es_alimento": false, "categoria": "Higiene"}
]}

${REGLAS_FECHAS.replace('{HOY}', hoy)}

Inventario actual del hogar (JSON, uno por línea):
${inventario}`;
}

function promptFecha(hoy: string): string {
  return `Escuchá el audio (español rioplatense): la persona está dictando la
fecha de vencimiento de un producto ("vence el 15 de noviembre", "12 del 3 del
2027", "en dos semanas"). Respondé ÚNICAMENTE el JSON pedido:
- "transcripcion": lo que dijo, tal cual.
- "fecha_vencimiento": la fecha en AAAA-MM-DD, o null si no dijo una fecha
  clara.
- "confianza": entre 0 y 1, qué tan seguro estás de la fecha.

${REGLAS_FECHAS.replace('{HOY}', hoy)}`;
}

function respuestaJson(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// 'audio/webm;codecs=opus' -> 'audio/webm'. Solo se aceptan tipos de audio.
function mimeDeAudio(mime: unknown): string | null {
  if (typeof mime !== 'string') return null;
  const base = mime.split(';')[0].trim().toLowerCase();
  return /^audio\/[a-z0-9.+-]+$/.test(base) ? base : null;
}

Deno.serve(async (req: Request) => {
  // Preflight de CORS.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return respuestaJson({ error: 'El pedido no es un JSON válido.' }, 400);
  }

  const { audio, modo = 'comando', hoy, productos } = body;
  const mimeType = mimeDeAudio(body.mimeType);

  if (typeof audio !== 'string' || audio.length === 0) {
    return respuestaJson({ error: 'Falta el audio (base64).' }, 400);
  }
  if (audio.length > MAX_AUDIO_BASE64) {
    return respuestaJson({ error: 'El audio es demasiado largo. Probá con un mensaje más corto.' }, 413);
  }
  if (!mimeType) {
    return respuestaJson({ error: 'Falta el formato del audio (mimeType).' }, 400);
  }
  if (modo !== 'comando' && modo !== 'fecha') {
    return respuestaJson({ error: 'Modo inválido.' }, 400);
  }
  // "Hoy" lo manda la app (fecha local del celular): el servidor corre en UTC
  // y a la noche en Argentina ya sería "mañana".
  const fechaHoy = typeof hoy === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(hoy) ? hoy : new Date().toISOString().slice(0, 10);

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return respuestaJson({ error: 'GEMINI_API_KEY no configurada en los secrets de la función.' }, 500);
  }

  const parteAudio = { inline_data: { mime_type: mimeType, data: audio } };

  try {
    if (modo === 'fecha') {
      const resultado = await consultarGemini<{ transcripcion: string; fecha_vencimiento: string | null; confianza?: number }>(
        [parteAudio, { text: promptFecha(fechaHoy) }],
        ESQUEMA_FECHA,
        apiKey,
        'voz-a-texto'
      );
      return respuestaJson({
        transcripcion: resultado.transcripcion ?? '',
        fecha_vencimiento: resultado.fecha_vencimiento ?? null,
        confianza: resultado.confianza,
      });
    }

    const inventario = (Array.isArray(productos) ? productos : [])
      .filter((p): p is ProductoInventario => typeof p?.id === 'string' && typeof p?.nombre === 'string')
      .slice(0, MAX_PRODUCTOS);

    const resultado = await consultarGemini<{ transcripcion: string; acciones: unknown[] }>(
      [parteAudio, { text: promptComando(fechaHoy, inventario) }],
      ESQUEMA_COMANDO,
      apiKey,
      'voz-a-texto'
    );
    return respuestaJson({
      transcripcion: resultado.transcripcion ?? '',
      acciones: Array.isArray(resultado.acciones) ? resultado.acciones : [],
    });
  } catch (error) {
    // El detalle técnico queda en los logs de la función; al usuario le
    // llega un mensaje entendible.
    console.error('[voz-a-texto]', error instanceof Error ? error.message : error);
    // Saturación de Google (503, sin cuota o lento, aun después de la
    // segunda vuelta): no es culpa del audio, conviene decirlo.
    const mensaje = esReintentable(error)
      ? 'El servicio de voz de Google está saturado en este momento. Probá de nuevo en unos minutos o cargalo a mano.'
      : 'No pudimos entender el audio en este momento. Probá de nuevo o cargalo a mano.';
    return respuestaJson({ error: mensaje }, esReintentable(error) ? 503 : 502);
  }
});
