import { supabase } from '../lib/supabase';

// Una fila de "Actividad reciente" de un hogar puntual (ver migración
// 20260907130000_actividad_hogar.sql). Hoy solo se genera automáticamente
// desde triggers sobre `productos` (RF7) -- crear/editar/eliminar un
// producto -- no hay todavía actividad de hogar_miembros ni de otras tablas.
export interface ActividadItem {
  id: string;
  tipo: string;
  descripcion: string;
  usuarioNombre: string | null;
  usuarioEmail: string | null;
  createdAt: string;
}

// Trae las últimas `limite` filas de actividad de un hogar, con
// nombre/email de quien hizo la acción. Va por RPC (no un select directo a
// `actividad_hogar`) porque el autor puede ser null (cuenta borrada) y
// resolver ese join opcional queda más simple del lado de Postgres.
export async function listarActividadReciente(hogarId: string, limite = 10): Promise<ActividadItem[]> {
  const { data, error } = await supabase.rpc('listar_actividad_reciente', { p_hogar_id: hogarId, p_limite: limite });
  if (error) throw error;

  return (data ?? []).map((fila) => ({
    id: fila.id,
    tipo: fila.tipo,
    descripcion: fila.descripcion,
    usuarioNombre: fila.usuario_nombre,
    usuarioEmail: fila.usuario_email,
    createdAt: fila.created_at,
  }));
}
