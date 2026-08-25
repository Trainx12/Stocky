import { supabase } from '../lib/supabase';

/**
 * Wrappers del cliente hacia las Edge Functions que procesan APIs externas
 * (OCR de tickets, detección de vencimiento por foto, voz a texto).
 *
 * Ninguna de las tres tiene lógica todavía: la evaluación de proveedores
 * es sprint 5 (OCR) y sprint 7 (voz) del plan. Lo que sí queda resuelto
 * acá es la FORMA de la interfaz — nombres de función, tipos de entrada
 * y salida — para que integrar el proveedor elegido en esos sprints sea
 * completar el cuerpo de la Edge Function correspondiente
 * (supabase/functions/<nombre>/index.ts) sin tener que tocar las pantallas
 * que ya las consuman.
 *
 * Las API keys de estos proveedores (Google Cloud Vision, Gemini, Google
 * Speech-to-Text) son secrets de las Edge Functions, nunca del cliente:
 * ver .env.example y supabase/functions/*.
 */

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

  if (error) throw error;
  // TODO (sprint 6): mapear la respuesta real del proveedor de OCR elegido.
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

  if (error) throw error;
  // TODO (sprint 6): mapear la respuesta real de Gemini Flash.
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
