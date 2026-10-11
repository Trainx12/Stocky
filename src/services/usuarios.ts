import { supabase } from '../lib/supabase';
import type { RolUsuario, Usuario } from '../types/database';

/**
 * ABM de usuarios de la plataforma, solo para administradores (RF9 parcial).
 * Todo va por RPC (ver migración 20261011120000_abm_usuarios_y_habilitado.sql)
 * y no por `.update()` directo sobre `usuarios`: desde esa migración nadie
 * tiene permiso de UPDATE sobre `rol`/`habilitado` a nivel tabla (antes
 * cualquier usuario podía hacerse admin a sí mismo, ver
 * docs/incidentes-sprint9.md #1). Las RPCs validan del lado del servidor que
 * quien llama sea admin, y que un admin no se deshabilite ni se quite el rol
 * a sí mismo.
 *
 * "Alta" no existe acá a propósito: las cuentas se crean solas al loguearse
 * con Google (trigger handle_new_auth_user). La "baja" es lógica
 * (habilitado = false): no se borra nada, así se puede revertir y los
 * productos/actividad del hogar no pierden a su autor.
 */

// Un usuario tal como lo ve la pantalla de administración.
export interface UsuarioAdmin {
  id: string;
  email: string;
  nombre: string | null;
  rol: RolUsuario;
  habilitado: boolean;
  createdAt: string;
  // En cuántos hogares es miembro aprobado (para dar contexto antes de
  // deshabilitar a alguien).
  cantidadHogares: number;
}

// Todos los usuarios de la plataforma. Si quien llama no es admin, la RPC
// tira error (no devuelve una lista parcial).
export async function listarUsuarios(): Promise<UsuarioAdmin[]> {
  const { data, error } = await supabase.rpc('admin_listar_usuarios');
  if (error) throw error;
  return (data ?? []).map((u) => ({
    id: u.id,
    email: u.email,
    nombre: u.nombre,
    rol: u.rol,
    habilitado: u.habilitado,
    createdAt: u.created_at,
    cantidadHogares: u.cantidad_hogares,
  }));
}

// Habilita o deshabilita una cuenta. Una cuenta deshabilitada deja de poder
// leer o escribir cualquier dato en el momento (helpers de RLS + trigger), y
// su app muestra "Cuenta deshabilitada" (ver AuthContext).
export async function cambiarHabilitado(usuarioId: string, habilitado: boolean): Promise<Usuario> {
  const { data, error } = await supabase.rpc('admin_set_usuario_habilitado', {
    p_usuario_id: usuarioId,
    p_habilitado: habilitado,
  });
  if (error) throw error;
  return data;
}

// Cambia el rol ('usuario' | 'administrador') de una cuenta.
export async function cambiarRol(usuarioId: string, rol: RolUsuario): Promise<Usuario> {
  const { data, error } = await supabase.rpc('admin_set_rol_usuario', { p_usuario_id: usuarioId, p_rol: rol });
  if (error) throw error;
  return data;
}

export type FiltroUsuarios = 'todos' | 'administradores' | 'deshabilitados';

// Búsqueda por nombre o email (sin distinguir mayúsculas ni tildes) + filtro
// por tipo. 100% client-side, mismo criterio que filtrarProductos: la lista
// de usuarios de la plataforma es chica.
export function filtrarUsuarios(usuarios: UsuarioAdmin[], busqueda: string, filtro: FiltroUsuarios): UsuarioAdmin[] {
  const normalizar = (texto: string) =>
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  const buscado = normalizar(busqueda);

  return usuarios.filter((u) => {
    const coincideBusqueda =
      !buscado || normalizar(u.nombre ?? '').includes(buscado) || normalizar(u.email).includes(buscado);
    const coincideFiltro =
      filtro === 'todos' ||
      (filtro === 'administradores' && u.rol === 'administrador') ||
      (filtro === 'deshabilitados' && !u.habilitado);
    return coincideBusqueda && coincideFiltro;
  });
}
