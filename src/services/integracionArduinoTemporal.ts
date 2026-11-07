import { supabase } from '../lib/supabase';
import { crearProducto } from './productos';
import type { CandidatoArduino, Producto, UnidadProducto } from '../types/database';

/**
 * INTEGRACIÓN ARDUINO (temporal) — ver docs/integracion-arduino-temporal.md.
 *
 * Wrapper de lo que necesita ArduinoCandidatosScreen sobre la tabla
 * `candidatos_arduino` (ver migración 20261106120000_integracion_arduino_temporal.sql):
 * listar los pendientes de un hogar, confirmar uno (lo crea como Producto
 * real vía services/productos.ts y recién ahí lo marca 'confirmado') o
 * descartarlo. Nunca se crea un Producto directo desde la Edge Function --
 * siempre pasa por esta confirmación manual, mismo criterio que
 * reconocerProductosDeTicket en services/externalApis.ts.
 */

export async function listarCandidatosArduinoPendientes(hogarId: string): Promise<CandidatoArduino[]> {
  const { data, error } = await supabase
    .from('candidatos_arduino')
    .select('*')
    .eq('hogar_id', hogarId)
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// Datos que el usuario puede ajustar en ArduinoCandidatosScreen antes de
// confirmar (por ejemplo, corregir el nombre o la cantidad que leyó Gemini
// antes de que quede como Producto del hogar).
export interface DatosConfirmacionCandidatoArduino {
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  cantidad: number;
}

export async function confirmarCandidatoArduino(
  candidato: CandidatoArduino,
  datos: DatosConfirmacionCandidatoArduino,
): Promise<Producto> {
  const producto = await crearProducto(candidato.hogar_id, {
    nombre: datos.nombre,
    categoria: datos.categoria,
    unidad: datos.unidad,
    cantidad: datos.cantidad,
    stockMinimo: 0,
    fechaVencimiento: null,
    alertaVencimientoHabilitada: false,
    // No sale del catálogo global: es un candidato suelto detectado por
    // Gemini, no una selección de CatalogoSelectorModal.
    catalogoId: null,
  });

  const { error } = await supabase.from('candidatos_arduino').update({ estado: 'confirmado' }).eq('id', candidato.id);
  if (error) throw error;

  return producto;
}

export async function descartarCandidatoArduino(candidatoId: string): Promise<void> {
  const { error } = await supabase.from('candidatos_arduino').update({ estado: 'descartado' }).eq('id', candidatoId);
  if (error) throw error;
}
