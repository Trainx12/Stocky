import { supabase } from '../lib/supabase';
import type { ComentarioConAutor, TipoComentario } from '../types/database';

/**
 * Comentarios de los usuarios ("Contanos qué mejorar", desde Cuenta). Los
 * leen los administradores en el panel Admin → Comentarios. Migración
 * 20261018120000_panel_admin_comentarios_y_borrar_cuenta.sql.
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
