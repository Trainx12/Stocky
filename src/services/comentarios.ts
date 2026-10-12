import { supabase } from '../lib/supabase';
import type { ComentarioConAutor, ResumenDelMes, TipoComentario } from '../types/database';
import { formatearFechaISO } from './productos';

/**
 * Comentarios de los usuarios ("Contanos qué mejorar", desde Cuenta) y el
 * resumen del mes del hogar (tarjeta del inicio). Migración
 * 20261017120000_lista_compras_comentarios_resumen_y_borrar_cuenta.sql.
 */

export const LARGO_MINIMO_COMENTARIO = 3;
export const LARGO_MAXIMO_COMENTARIO = 2000;

export function validarComentario(mensaje: string): string | null {
  const limpio = mensaje.trim();
  if (limpio.length < LARGO_MINIMO_COMENTARIO) return 'Contanos un poco más (al menos unas palabras).';
  if (limpio.length > LARGO_MAXIMO_COMENTARIO) return `El comentario puede tener hasta ${LARGO_MAXIMO_COMENTARIO} caracteres.`;
  return null;
}

// Manda un comentario a nombre del usuario logueado. Además del texto va
// la plataforma y la versión de la app, para entender de dónde viene.
export async function enviarComentario(
  usuarioId: string,
  tipo: TipoComentario,
  mensaje: string,
  contexto: { plataforma: string; version: string },
): Promise<void> {
  const problema = validarComentario(mensaje);
  if (problema) throw new Error(problema);
  const { error } = await supabase.from('comentarios').insert({
    usuario_id: usuarioId,
    tipo,
    mensaje: mensaje.trim(),
    plataforma: contexto.plataforma.slice(0, 20),
    version_app: contexto.version.slice(0, 20),
  });
  if (error) throw error;
}

// Solo administradores (la función lo chequea en la base).
export async function listarComentarios(limite = 100): Promise<ComentarioConAutor[]> {
  const { data, error } = await supabase.rpc('admin_listar_comentarios', { p_limite: limite });
  if (error) throw error;
  return data ?? [];
}

export const ETIQUETA_TIPO_COMENTARIO: Record<TipoComentario, string> = {
  idea: 'Idea',
  problema: 'Problema',
  otro: 'Otro',
};

// --- Resumen del mes -----------------------------------------------------------

// Primer día del mes de `hoy`, en hora local ("2026-10-01").
export function primerDiaDelMes(hoy: Date = new Date()): string {
  return formatearFechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function nombreDelMes(hoy: Date = new Date()): string {
  return MESES[hoy.getMonth()];
}

export async function obtenerResumenDelMes(hogarId: string, hoy: Date = new Date()): Promise<ResumenDelMes> {
  const { data, error } = await supabase.rpc('resumen_del_mes', { p_hogar_id: hogarId, p_desde: primerDiaDelMes(hoy) });
  if (error) throw error;
  return {
    cargados: Number(data?.cargados ?? 0),
    usados: Number(data?.usados ?? 0),
    vencidos: Number(data?.vencidos ?? 0),
    por_vencer_semana: Number(data?.por_vencer_semana ?? 0),
  };
}

/**
 * Frase que acompaña los números, para que el resumen motive en vez de
 * retar. Sin movimientos todavía, invita a empezar.
 */
export function mensajeDelResumen(r: ResumenDelMes): string {
  if (r.cargados === 0 && r.usados === 0 && r.vencidos === 0) {
    return 'Todavía no hay movimientos este mes. ¡Cargá lo que compraste y empezá a llevar la cuenta!';
  }
  if (r.vencidos === 0) return '¡Nada se te venció este mes! Seguí así. 🎉';
  if (r.usados >= r.vencidos * 3) return 'Vas muy bien: usaste mucho más de lo que se venció.';
  return 'Revisá "Próximos a vencer" seguido para aprovechar todo antes de que venza.';
}
