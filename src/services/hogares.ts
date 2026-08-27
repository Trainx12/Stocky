import { supabase } from '../lib/supabase';
import type { Hogar } from '../types/database';

/**
 * RF6 — un usuario puede pertenecer a más de un hogar: crear uno propio y
 * además unirse a otros ya existentes (por código de invitación).
 *
 * Las tres operaciones que modifican membresía (crear/unirse/salir) se
 * resuelven con una función de Postgres (RPC), no con .insert()/.update()
 * sueltos desde acá: cada una toca más de una tabla a la vez (hogares +
 * hogar_miembros, o usuarios + hogar_miembros) y necesita ser atómica.
 * Ver supabase/migrations/20260826130000_hogares_multi_membresia.sql.
 */

// Crea un hogar nuevo y suma al usuario logueado como su primer miembro.
export async function crearHogar(nombre: string): Promise<Hogar> {
  const { data, error } = await supabase.rpc('crear_hogar', { p_nombre: nombre });
  if (error) throw error;
  return data;
}

// Une al usuario logueado a un hogar ya existente, a partir del código
// corto de invitación (no del uuid).
export async function unirseAHogar(codigo: string): Promise<Hogar> {
  const { data, error } = await supabase.rpc('unirse_a_hogar', { p_codigo: codigo });
  if (error) throw error;
  return data;
}

// Da de baja al usuario logueado de un hogar puntual (no borra el hogar
// en sí, solo su membresía). Si era su hogar activo, el backend reasigna
// solo cuál pasa a serlo (ver salir_de_hogar en la migración).
export async function salirDeHogar(hogarId: string): Promise<void> {
  const { error } = await supabase.rpc('salir_de_hogar', { p_hogar_id: hogarId });
  if (error) throw error;
}

// Cambia el nombre de un hogar existente. A diferencia de crear/unirse/salir,
// esto es un update de una sola tabla y una sola fila: no necesita una RPC
// para ser atómico, alcanza con el .update() directo — la policy
// "hogares_update_propio_o_miembro_o_admin" (ver la migración de
// multi-membresía) ya exige ser miembro del hogar o admin para poder tocarlo.
export async function editarHogar(hogarId: string, nombre: string): Promise<Hogar> {
  const nombreLimpio = nombre.trim();
  if (!nombreLimpio) throw new Error('El nombre del hogar no puede estar vacío');

  const { data, error } = await supabase
    .from('hogares')
    .update({ nombre: nombreLimpio })
    .eq('id', hogarId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Lista todos los hogares a los que pertenece el usuario logueado (no
// solo el "activo"), para la pantalla/sheet de "Administrar Mis Hogares".
export async function listarMisHogares(): Promise<Hogar[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const userId = userData.user?.id;
  if (!userId) return [];

  // OJO: no alcanza con dejar que la RLS "filtre sola". La policy de
  // hogar_miembros también deja ver todo a un admin (es_administrador()),
  // así que sin este .eq() explícito, una cuenta admin vería acá los
  // hogares de CUALQUIER usuario mezclados con los propios — encontrado
  // en QA (ver PR #1): la pantalla dice "Tus hogares activos", tiene que
  // filtrar por el usuario actual sin importar qué tan permisiva sea la
  // RLS para ese rol.
  const { data, error } = await supabase
    .from('hogar_miembros')
    .select('hogares(*)')
    .eq('usuario_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // El select anidado devuelve cada fila como { hogares: {...} }; se
  // aplana acá para que el resto de la app trabaje con Hogar[] directo.
  return (data ?? []).map((fila) => fila.hogares).filter((h): h is Hogar => h !== null);
}
