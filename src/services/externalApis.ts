import { supabase } from '../lib/supabase';

/**
 * Wrappers del cliente hacia las Edge Functions que procesan APIs externas
 * (OCR de tickets, detección de vencimiento por foto, voz a texto).
 *
 * ocr-ticket (OCR.space), vencimiento-foto y voz-a-texto (Gemini) llaman
 * al proveedor real (ver docs/plan-de-testing.md, Sprints 5 y 8).
 *
 * Las API keys de estos proveedores (OCR.space, Gemini) son secrets de las
 * Edge Functions, nunca del cliente:
 * ver .env.example y supabase/functions/*.
 */

// supabase-js reporta cualquier respuesta no-2xx de una Edge Function como el
// genérico "Edge Function returned a non-2xx status code", escondiendo el
// mensaje real que devolvió la función en su body. Se lo rescata para que la
// pantalla pueda mostrar algo útil.
async function lanzarErrorDeFuncion(error: unknown): Promise<never> {
  const respuesta = (error as { context?: Response } | null)?.context;
  let mensaje: string | null = null;
  if (respuesta && typeof respuesta.json === 'function') {
    try {
      const cuerpo = await respuesta.json();
      mensaje = typeof cuerpo?.error === 'string' ? cuerpo.error : null;
    } catch {
      mensaje = null;
    }
  }
  if (mensaje) throw new Error(mensaje);
  throw error;
}

// Un producto "candidato" detectado por OCR o por voz, todavía sin guardar.
export interface ProductoReconocido {
  nombre: string;
  cantidad?: number;
  unidad?: string;
}

/**
 * RF4 — Ticket de compra fotografiado -> lista de productos candidatos.
 * El usuario los confirma en la UI antes de que se persistan como
 * Producto; por eso esto devuelve candidatos, no productos ya guardados.
 */
export async function reconocerProductosDeTicket(
  _imagenBase64: string
): Promise<ProductoReconocido[]> {
  const { data, error } = await supabase.functions.invoke('ocr-ticket', {
    body: { imagen: _imagenBase64 },
  });

  if (error) return lanzarErrorDeFuncion(error);
  return data as ProductoReconocido[];
}

// Resultado de leer una fecha de vencimiento en una foto del envase.
export interface VencimientoReconocido {
  fecha_vencimiento: string | null; // ISO date, null si no se pudo detectar
  confianza?: number;
}

/**
 * Detecta una fecha de vencimiento a partir de una foto del envase
 * (usado junto a RF2). Se mantiene desacoplado del guardado del producto
 * por el mismo motivo que el OCR de tickets: el usuario confirma antes.
 */
export async function reconocerVencimientoDeFoto(
  _imagenBase64: string
): Promise<VencimientoReconocido> {
  const { data, error } = await supabase.functions.invoke('vencimiento-foto', {
    body: { imagen: _imagenBase64 },
  });

  if (error) return lanzarErrorDeFuncion(error);
  return data as VencimientoReconocido;
}

// Audio grabado listo para mandar (ver src/lib/grabacion.ts).
export interface AudioGrabado {
  base64: string;
  mimeType: string;
}

// Lo mínimo de cada producto del hogar que necesita el modelo para saber a
// cuál se refiere una baja o modificación dicha por voz.
export interface ProductoParaVoz {
  id: string;
  nombre: string;
  marca: string | null;
  cantidad: number;
  unidad: string;
  fecha_vencimiento: string | null;
}

// Una acción tal como la interpretó Gemini, todavía sin validar (ver
// services/voz.ts, que la cruza con el inventario y el catálogo).
export interface AccionDeVozInterpretada {
  accion: 'alta' | 'baja' | 'modificacion';
  producto_id?: string | null;
  nombre: string;
  marca?: string | null;
  cantidad?: number | null;
  unidad?: string | null;
  operacion_cantidad?: 'fijar' | 'sumar' | 'restar' | null;
  fecha_vencimiento?: string | null;
  // Solo para altas: false si no es comida ("shampoo", "detergente"). Null
  // o ausente = no se sabe (versiones viejas de voz-a-texto).
  es_alimento?: boolean | null;
  // Categoría sugerida por el modelo, para lo que no está en el catálogo.
  categoria?: string | null;
}

// Qué dijo el usuario y qué acciones de ABM se entendieron.
// Cómo se escuchó el audio según Gemini. Ruido de fondo y habla poco clara
// van separados: hablar bajo o con acento no es "ruido".
export interface CalidadDeAudio {
  ruido_de_fondo: 'ninguno' | 'poco' | 'mucho';
  habla_poco_clara: boolean;
}

export interface ComandoDeVozInterpretado {
  transcripcion: string;
  acciones: AccionDeVozInterpretada[];
  /** null si la función no la mandó (versión anterior) o vino rara. */
  calidad?: CalidadDeAudio | null;
}

/**
 * RF8 — Audio grabado por el usuario -> comandos de ABM de productos ya
 * interpretados (sin persistir todavía: la pantalla que llama a esto es
 * responsable de mostrarlos, dejar confirmarlos y recién ahí aplicarlos).
 * `hoy` es la fecha local del dispositivo, para resolver "mañana", "el
 * viernes", etc.
 */
export async function interpretarComandoDeVoz(
  audio: AudioGrabado,
  productos: ProductoParaVoz[],
  hoy: string
): Promise<ComandoDeVozInterpretado> {
  const { data, error } = await supabase.functions.invoke('voz-a-texto', {
    body: { audio: audio.base64, mimeType: audio.mimeType, modo: 'comando', productos, hoy },
  });

  if (error) return lanzarErrorDeFuncion(error);
  return {
    transcripcion: data?.transcripcion ?? '',
    acciones: Array.isArray(data?.acciones) ? data.acciones : [],
    calidad: leerCalidadDeAudio(data?.calidad_audio),
  };
}

// Lo mismo que interpretarComandoDeVoz pero ESCRITO de corrido ("2 leches
// vencen 15/11, 1 kg de papa"), para quien no puede o no quiere hablar en voz
// alta. Misma función (voz-a-texto) y mismas reglas; no trae calidad de audio.
export const LARGO_MAXIMO_COMANDO_ESCRITO = 500;

export async function interpretarComandoEscrito(
  texto: string,
  productos: ProductoParaVoz[],
  hoy: string
): Promise<ComandoDeVozInterpretado> {
  const { data, error } = await supabase.functions.invoke('voz-a-texto', {
    body: { texto: texto.trim(), modo: 'comando', productos, hoy },
  });

  if (error) return lanzarErrorDeFuncion(error);
  return {
    transcripcion: data?.transcripcion ?? texto.trim(),
    acciones: Array.isArray(data?.acciones) ? data.acciones : [],
    calidad: null,
  };
}

function leerCalidadDeAudio(valor: unknown): CalidadDeAudio | null {
  const c = valor as Partial<CalidadDeAudio> | null | undefined;
  if (!c || !['ninguno', 'poco', 'mucho'].includes(c.ruido_de_fondo as string)) return null;
  return { ruido_de_fondo: c.ruido_de_fondo as CalidadDeAudio['ruido_de_fondo'], habla_poco_clara: c.habla_poco_clara === true };
}

// Resultado de dictar una fecha de vencimiento.
export interface FechaDictada extends VencimientoReconocido {
  transcripcion: string;
}

/**
 * Sprint 8 — fecha de vencimiento dictada por voz para el formulario de
 * producto. Igual que la foto del envase: solo sugiere, el usuario guarda.
 */
export async function reconocerFechaPorVoz(audio: AudioGrabado, hoy: string): Promise<FechaDictada> {
  const { data, error } = await supabase.functions.invoke('voz-a-texto', {
    body: { audio: audio.base64, mimeType: audio.mimeType, modo: 'fecha', hoy },
  });

  if (error) return lanzarErrorDeFuncion(error);
  return {
    transcripcion: data?.transcripcion ?? '',
    fecha_vencimiento: data?.fecha_vencimiento ?? null,
    confianza: data?.confianza,
  };
}
