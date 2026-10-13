import { supabase } from '../lib/supabase';
import type { AccionAdmin, MetricasAdmin, ProductoCatalogo, UnidadProducto } from '../types/database';
import { UNIDADES_DISPONIBLES } from './escaneo';

/**
 * Panel de administración (pestaña "Admin" de la barra de abajo, solo para
 * administradores). Migración 20261018120000_panel_admin_comentarios_y_borrar_cuenta.sql.
 *
 * Todo lo que hace un admin se valida en la base (RLS y funciones que
 * chequean es_administrador()), no solo escondiendo botones; y cada cambio
 * de usuarios o del catálogo queda anotado solo, por triggers, en
 * `admin_registro` ("Registro de acciones").
 */

// Cuenta principal del proyecto: nadie le puede quitar el rol ni
// deshabilitarla, y no se borra desde la app. La regla real está en la base
// (es_cuenta_protegida); esta lista es solo para que la pantalla no ofrezca
// botones que igual van a fallar.
export const CUENTAS_PROTEGIDAS = ['ruttyfacundo@gmail.com'];

export function esCuentaProtegida(email: string | null | undefined): boolean {
  return !!email && CUENTAS_PROTEGIDAS.includes(email.trim().toLowerCase());
}

// --- Métricas (RF10) ------------------------------------------------------------

export async function obtenerMetricas(): Promise<MetricasAdmin> {
  const { data, error } = await supabase.rpc('admin_metricas');
  if (error) throw error;
  const d = (data ?? {}) as Partial<Record<keyof MetricasAdmin, unknown>>;
  const n = (k: keyof MetricasAdmin) => Number(d[k] ?? 0);
  return {
    usuarios_total: n('usuarios_total'),
    usuarios_deshabilitados: n('usuarios_deshabilitados'),
    usuarios_nuevos_30d: n('usuarios_nuevos_30d'),
    usuarios_activos_30d: n('usuarios_activos_30d'),
    administradores: n('administradores'),
    hogares_total: n('hogares_total'),
    hogares_activos_30d: n('hogares_activos_30d'),
    productos_en_despensas: n('productos_en_despensas'),
    productos_cargados_30d: n('productos_cargados_30d'),
    catalogo_aprobados: n('catalogo_aprobados'),
    sugerencias_pendientes: n('sugerencias_pendientes'),
    comentarios_30d: n('comentarios_30d'),
  };
}

export interface TarjetaMetrica {
  clave: string;
  valor: number;
  titulo: string;
  detalle: string;
}

// Las métricas como tarjetas para la pantalla: número grande + qué es +
// un detalle que lo pone en contexto.
export function tarjetasDeMetricas(m: MetricasAdmin): TarjetaMetrica[] {
  return [
    {
      clave: 'usuarios',
      valor: m.usuarios_total,
      titulo: 'Usuarios',
      detalle: `${m.usuarios_activos_30d} activos y ${m.usuarios_nuevos_30d} nuevos en 30 días`,
    },
    {
      clave: 'hogares',
      valor: m.hogares_total,
      titulo: 'Hogares',
      detalle: `${m.hogares_activos_30d} con movimiento en 30 días`,
    },
    {
      clave: 'productos',
      valor: m.productos_en_despensas,
      titulo: 'Productos en despensas',
      detalle: `${m.productos_cargados_30d} cargados en 30 días`,
    },
    {
      clave: 'catalogo',
      valor: m.catalogo_aprobados,
      titulo: 'Productos en el catálogo',
      detalle: m.sugerencias_pendientes === 1 ? '1 sugerencia pendiente' : `${m.sugerencias_pendientes} sugerencias pendientes`,
    },
    {
      clave: 'admins',
      valor: m.administradores,
      titulo: 'Administradores',
      detalle: m.usuarios_deshabilitados === 1 ? '1 cuenta deshabilitada' : `${m.usuarios_deshabilitados} cuentas deshabilitadas`,
    },
    {
      clave: 'comentarios',
      valor: m.comentarios_30d,
      titulo: 'Comentarios',
      detalle: 'recibidos en 30 días',
    },
  ];
}

// --- Registro de acciones ---------------------------------------------------------

export async function listarRegistro(limite = 200): Promise<AccionAdmin[]> {
  const { data, error } = await supabase
    .from('admin_registro')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

// Ícono por tipo de acción registrada.
export function iconoDeAccion(accion: string): string {
  if (accion.startsWith('sugerencia_aprobar')) return 'checkmark-circle-outline';
  if (accion.startsWith('sugerencia_rechazar')) return 'close-circle-outline';
  if (accion === 'catalogo_agregar') return 'add-circle-outline';
  if (accion === 'catalogo_editar') return 'create-outline';
  if (accion === 'catalogo_sacar') return 'trash-outline';
  if (accion === 'usuario_rol') return 'shield-outline';
  if (accion === 'usuario_habilitado') return 'person-outline';
  return 'ellipse-outline';
}

// --- Catálogo -----------------------------------------------------------------------

export interface DatosCatalogo {
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
}

export const LARGO_MAXIMO_NOMBRE_CATALOGO = 60;

// Limpia y valida lo que se carga en el formulario del catálogo. Devuelve
// el mensaje de error, o los datos listos para guardar.
export function validarProductoCatalogo(datos: DatosCatalogo): { error: string } | { datos: DatosCatalogo } {
  const nombre = datos.nombre.trim().replace(/\s+/g, ' ');
  const categoria = datos.categoria.trim().replace(/\s+/g, ' ');
  if (!nombre) return { error: 'Escribí el nombre del producto.' };
  if (nombre.length > LARGO_MAXIMO_NOMBRE_CATALOGO) return { error: `El nombre puede tener hasta ${LARGO_MAXIMO_NOMBRE_CATALOGO} caracteres.` };
  if (!categoria) return { error: 'Elegí o escribí una categoría.' };
  if (!UNIDADES_DISPONIBLES.includes(datos.unidad)) return { error: 'Elegí una unidad.' };
  return { datos: { nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), categoria, unidad: datos.unidad } };
}

// El índice único del catálogo (nombre sin mayúsculas) devuelve un error
// técnico; se traduce a algo entendible.
function errorDeCatalogo(error: { code?: string; message?: string }): Error {
  if (error.code === '23505') return new Error('Ya hay un producto con ese nombre en el catálogo.');
  return new Error(error.message ?? 'No se pudo guardar.');
}

// Todo el catálogo aprobado, para administrarlo (ordenado por nombre).
export async function listarCatalogoParaAdmin(): Promise<ProductoCatalogo[]> {
  const { data, error } = await supabase
    .from('productos_catalogo')
    .select('*')
    .eq('estado', 'aprobado')
    .order('nombre', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// Un admin agrega productos ya aprobados (no pasan por "sugerencias").
export async function agregarAlCatalogo(datos: DatosCatalogo): Promise<void> {
  const validado = validarProductoCatalogo(datos);
  if ('error' in validado) throw new Error(validado.error);
  const { error } = await supabase.from('productos_catalogo').insert({ ...validado.datos, estado: 'aprobado' });
  if (error) throw errorDeCatalogo(error);
}

export async function editarCatalogo(id: string, datos: DatosCatalogo): Promise<void> {
  const validado = validarProductoCatalogo(datos);
  if ('error' in validado) throw new Error(validado.error);
  const { error } = await supabase.from('productos_catalogo').update(validado.datos).eq('id', id);
  if (error) throw errorDeCatalogo(error);
}

// Saca un producto del catálogo. Las despensas que lo tenían NO lo pierden:
// solo deja de estar vinculado al catálogo (admin_sacar_del_catalogo).
export async function sacarDelCatalogo(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_sacar_del_catalogo', { p_catalogo_id: id });
  if (error) throw error;
}
