// Llamada a Gemini compartida por vencimiento-foto y voz-a-texto: misma key,
// mismos modelos de respaldo y mismo criterio de reintento. Cada función solo
// arma sus `partes` (imagen o audio + prompt) y el esquema JSON que espera.

// Modelos a probar en orden. Google satura o retira modelos Flash seguido
// (503 "high demand", 404 "ya no disponible"), así que si el primero falla por
// eso se pasa al siguiente. Se puede cambiar sin tocar código con el secret
// GEMINI_MODEL (lista separada por comas, ej: "gemini-3.5-flash,gemini-3.8-flash").
//
// Orden elegido midiendo en los logs (octubre 2026): 3.5-flash responde en
// 1-5 s cuando no está saturado y es el más preciso de los rápidos;
// 3.5-flash-lite tarda 3-10 s y a veces pierde detalles (una cantidad dicha);
// 3.8-flash devolvía 503 o pasaba los 15 s, queda como último recurso.
const MODELOS_POR_DEFECTO = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const ESTADOS_REINTENTABLES = [404, 429, 500, 503];
// Tiempo máximo por intento: un modelo lento o saturado no puede colgar la
// pantalla (en pruebas llegó a tardar ~80 s en un modelo de respaldo).
const TIMEOUT_POR_INTENTO_MS = 15_000;
// Si un modelo no contestó en este tiempo, se le pregunta en paralelo al
// siguiente y gana el primero que responda: la demora de Gemini varía mucho
// entre pedidos (el mismo modelo tardó 1 s y 15 s+ con minutos de diferencia),
// y esperar el timeout completo antes de pasar al respaldo era lo que más
// hacía esperar al usuario.
const ESPERA_ANTES_DEL_RESPALDO_MS = 5_000;

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
  pensamientoMinimo: boolean,
  cancelar: AbortSignal
): Promise<T> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;

  const respuesta = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.any([AbortSignal.timeout(TIMEOUT_POR_INTENTO_MS), cancelar]),
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

// Un intento completo con un modelo. Si no acepta el nivel de pensamiento
// (400), se prueba el mismo modelo con su configuración por defecto.
async function intentarModelo<T>(
  modelo: string,
  partes: ParteGemini[],
  esquema: Record<string, unknown>,
  apiKey: string,
  cancelar: AbortSignal
): Promise<T> {
  try {
    return await consultarModelo<T>(modelo, partes, esquema, apiKey, true, cancelar);
  } catch (error) {
    if (!(error instanceof ErrorGemini && error.estado === 400)) throw error;
    return await consultarModelo<T>(modelo, partes, esquema, apiKey, false, cancelar);
  }
}

// Saturado, sin cuota, retirado o lento: se pasa al siguiente modelo.
// Cualquier otro error es real (audio inválido, key mala) y corta todo.
function esReintentable(error: unknown): boolean {
  const esTimeout = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
  return esTimeout || (error instanceof ErrorGemini && ESTADOS_REINTENTABLES.includes(error.estado));
}

// Prueba los modelos en orden y devuelve la primera respuesta. Un modelo
// arranca cuando el anterior falla o cuando lleva ESPERA_ANTES_DEL_RESPALDO_MS
// sin contestar (sin cortar al anterior, que puede seguir y ganar). Al
// terminar se cancelan los pedidos que quedaron en vuelo. `etiqueta` solo
// sirve para identificar la función en los logs.
export function consultarGemini<T>(
  partes: ParteGemini[],
  esquema: Record<string, unknown>,
  apiKey: string,
  etiqueta: string
): Promise<T> {
  const configurados = (Deno.env.get('GEMINI_MODEL') ?? '').split(',').map((m) => m.trim()).filter(Boolean);
  const modelos = configurados.length > 0 ? configurados : MODELOS_POR_DEFECTO;
  const cancelador = new AbortController();

  return new Promise<T>((resolver, rechazar) => {
    let siguiente = 0;
    let enVuelo = 0;
    let terminado = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let ultimoError: unknown = new Error('No hay modelos configurados.');

    const terminar = (accion: () => void) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(temporizador);
      cancelador.abort();
      accion();
    };

    const lanzarSiguiente = () => {
      clearTimeout(temporizador);
      if (terminado) return;
      if (siguiente >= modelos.length) {
        if (enVuelo === 0) terminar(() => rechazar(ultimoError));
        return;
      }

      const modelo = modelos[siguiente++];
      const inicio = Date.now();
      enVuelo++;
      temporizador = setTimeout(lanzarSiguiente, ESPERA_ANTES_DEL_RESPALDO_MS);

      intentarModelo<T>(modelo, partes, esquema, apiKey, cancelador.signal).then(
        (resultado) => {
          enVuelo--;
          // Qué modelo respondió y cuánto tardó: sirve para revisar el orden
          // de MODELOS_POR_DEFECTO mirando los logs.
          if (!terminado) console.log(`[${etiqueta}] ${modelo} respondió en ${Date.now() - inicio} ms`);
          terminar(() => resolver(resultado));
        },
        (error) => {
          enVuelo--;
          if (terminado) return; // cancelado porque ya ganó otro
          ultimoError = error;
          console.error(`[${etiqueta}] ${modelo}:`, error instanceof Error ? error.message : error);
          if (!esReintentable(error)) {
            terminar(() => rechazar(error));
            return;
          }
          // Falló rápido (503, sin cuota): no tiene sentido esperar, se pasa
          // ya al siguiente. Si no quedan, se espera a los que siguen en vuelo.
          lanzarSiguiente();
        }
      );
    };

    lanzarSiguiente();
  });
}
