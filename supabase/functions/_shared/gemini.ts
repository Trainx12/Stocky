// Llamada a Gemini compartida por vencimiento-foto y voz-a-texto: misma key,
// mismos modelos de respaldo y mismo criterio de reintento. Cada función solo
// arma sus `partes` (imagen o audio + prompt) y el esquema JSON que espera.

// Modelos a probar en orden. Google satura o retira modelos Flash seguido
// (503 "high demand", 404 "ya no disponible"), así que si el primero falla por
// eso se pasa al siguiente. Se puede cambiar sin tocar código con el secret
// GEMINI_MODEL (lista separada por comas, ej: "gemini-3.8-flash,gemini-3.5-flash").
const MODELOS_POR_DEFECTO = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];
const ESTADOS_REINTENTABLES = [404, 429, 500, 503];
// Tiempo máximo por intento: un modelo lento o saturado no puede colgar la
// pantalla (en pruebas llegó a tardar ~80 s en un modelo de respaldo).
const TIMEOUT_POR_INTENTO_MS = 15_000;

export class ErrorGemini extends Error {
  constructor(public estado: number, detalle: string) {
    super(`Gemini respondió ${estado}: ${detalle}`);
  }
}

// Una parte del mensaje: un archivo en base64 (imagen, audio) o texto.
export type ParteGemini = { inline_data: { mime_type: string; data: string } } | { text: string };

async function consultarModelo<T>(
  modelo: string,
  partes: ParteGemini[],
  esquema: Record<string, unknown>,
  apiKey: string,
  pensamientoMinimo: boolean
): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  const respuesta = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(TIMEOUT_POR_INTENTO_MS),
    // La key va en header (no en la URL): así no queda en ningún log y
    // funciona con todos los formatos de key de AI Studio.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: partes }],
      generationConfig: {
        // Leer una fecha o entender una frase corta no necesita razonar: con
        // el nivel por defecto ("medium") los modelos 3.x tardaban decenas de
        // segundos.
        ...(pensamientoMinimo ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
        responseMimeType: 'application/json',
        responseSchema: esquema,
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
  return JSON.parse(texto) as T;
}

// Prueba los modelos en orden hasta que uno responda. `etiqueta` solo sirve
// para identificar la función en los logs.
export async function consultarGemini<T>(
  partes: ParteGemini[],
  esquema: Record<string, unknown>,
  apiKey: string,
  etiqueta: string
): Promise<T> {
  const configurados = (Deno.env.get('GEMINI_MODEL') ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const modelos = configurados.length > 0 ? configurados : MODELOS_POR_DEFECTO;

  let ultimoError: unknown = new Error('No hay modelos configurados.');
  for (const modelo of modelos) {
    try {
      try {
        return await consultarModelo<T>(modelo, partes, esquema, apiKey, true);
      } catch (error) {
        // Si el modelo no acepta el nivel de pensamiento (400), se prueba el
        // mismo modelo con su configuración por defecto.
        if (error instanceof ErrorGemini && error.estado === 400) {
          return await consultarModelo<T>(modelo, partes, esquema, apiKey, false);
        }
        throw error;
      }
    } catch (error) {
      ultimoError = error;
      console.error(`[${etiqueta}] ${modelo}:`, error instanceof Error ? error.message : error);
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
