import { supabase } from '../lib/supabase';

/**
 * Wrappers del cliente hacia las Edge Functions que procesan APIs externas
 * (OCR de tickets, detección de vencimiento por foto, voz a texto).
 *
 * ocr-ticket (OCR.space) y vencimiento-foto (Gemini 2.5 Flash) ya llaman
 * al proveedor real (ver docs/plan-de-testing.md, Sprint 5). voz-a-texto
 * sigue pendiente de evaluación de proveedor (sprint 7).
 *
 * Las API keys de estos proveedores (OCR.space, Gemini, Google
 * Speech-to-Text) son secrets de las Edge Functions, nunca del cliente:
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

// Qué acción pidió el usuario por voz, y sobre qué producto.
export interface ComandoDeVozInterpretado {
  accion: 'alta' | 'baja' | 'modificacion';
  producto: ProductoReconocido;
}

/**
 * RF8 — Audio grabado por el usuario -> comando de ABM de productos ya
 * interpretado (sin persistir todavía: la pantalla que llama a esto es
 * responsable de confirmar y aplicar el cambio sobre `productos`).
 */
export async function interpretarComandoDeVoz(
  _audioBase64: string
): Promise<ComandoDeVozInterpretado> {
  const { data, error } = await supabase.functions.invoke('voz-a-texto', {
    body: { audio: _audioBase64 },
  });

  if (error) throw error;
  // TODO (sprint 7): mapear la respuesta real de Google Speech-to-Text + IA.
  return data as ComandoDeVozInterpretado;
}
