import { supabase } from '../lib/supabase';
import type { ItemListaCompras, ProductoCatalogo, UnidadProducto } from '../types/database';
import { buscarEnCatalogo, normalizarNombre } from './escaneo';
import { crearProducto } from './productos';
import type { AlertaStock } from './productos';

/**
 * Lista de compras compartida por hogar (tabla `lista_compras`, migración
 * 20261017120000_lista_compras_comentarios_resumen_y_borrar_cuenta.sql).
 *
 * Cierra el círculo de la despensa: "Stock bajo" dice qué falta → se pasa a
 * la lista ("Agregar lo que falta") → en el súper se va tildando → "Guardé
 * las compras" carga lo tildado en la despensa y lo saca de la lista. Todos
 * los miembros del hogar ven la misma lista, en tiempo real.
 */

export const LARGO_MAXIMO_ITEM = 80;

// Datos para agregar un ítem. Si coincide con el catálogo, nombre,
// categoría y unidad salen de ahí (así al cargarlo en la despensa se junta
// con el mismo producto que ya existe).
export interface NuevoItem {
  nombre: string;
  cantidad: number;
  unidad: UnidadProducto;
  categoria: string;
  catalogoId: string | null;
}

// "Leche" + catálogo → Leche, Lácteos, l. Si no está en el catálogo, se deja
// el nombre como se escribió, en "Otros" y por unidad.
export function itemDesdeTexto(texto: string, catalogo: ProductoCatalogo[], cantidad = 1): NuevoItem {
  const limpio = texto.trim().replace(/\s+/g, ' ');
  const enCatalogo = buscarEnCatalogo(limpio, catalogo);
  return {
    nombre: enCatalogo?.nombre ?? limpio.charAt(0).toUpperCase() + limpio.slice(1),
    cantidad,
    unidad: enCatalogo?.unidad ?? 'unidad',
    categoria: enCatalogo?.categoria ?? 'Otros',
    catalogoId: enCatalogo?.id ?? null,
  };
}

export function validarItem(item: NuevoItem): string | null {
  if (!item.nombre.trim()) return 'Escribí qué querés comprar.';
  if (item.nombre.trim().length > LARGO_MAXIMO_ITEM) return `El nombre puede tener hasta ${LARGO_MAXIMO_ITEM} caracteres.`;
  if (!(item.cantidad > 0)) return 'La cantidad tiene que ser mayor a 0.';
  return null;
}

// Mismo producto = mismo nombre (sin mayúsculas/tildes) y unidad: así "Leche"
// no se agrega dos veces, pero "Leche (l)" y "Leche (paquete)" sí son dos.
export function claveItem(item: Pick<ItemListaCompras, 'nombre' | 'unidad'>): string {
  return `${normalizarNombre(item.nombre)}|${item.unidad}`;
}

/**
 * Lo que está en "Stock bajo" y todavía no está en la lista, listo para
 * agregar. Cantidad sugerida: lo que falta para llegar al mínimo (al menos 1).
 */
export function faltantesParaLista(alertas: AlertaStock[], items: ItemListaCompras[]): NuevoItem[] {
  const enLista = new Set(items.map(claveItem));
  const vistos = new Set<string>();
  const faltantes: NuevoItem[] = [];
  for (const a of alertas) {
    const clave = claveItem(a);
    if (enLista.has(clave) || vistos.has(clave)) continue;
    vistos.add(clave);
    faltantes.push({
      nombre: a.nombre,
      cantidad: Math.max(Math.round((a.stockMinimo - a.cantidadTotal) * 1000) / 1000, 1),
      unidad: a.unidad,
      categoria: a.categoria ?? 'Otros',
      catalogoId: a.catalogoId,
    });
  }
  return faltantes;
}

// Para mostrar: primero lo que falta comprar (en el orden en que se agregó)
// y abajo lo ya tildado.
export function ordenarLista(items: ItemListaCompras[]): ItemListaCompras[] {
  return [...items].sort((a, b) => {
    if (a.comprado !== b.comprado) return a.comprado ? 1 : -1;
    return a.created_at.localeCompare(b.created_at);
  });
}

// "2 kg", "1 paquete", "3" (unidad suelta no se muestra).
export function textoCantidadItem(item: Pick<ItemListaCompras, 'cantidad' | 'unidad'>): string {
  const n = String(Math.round(item.cantidad * 1000) / 1000).replace('.', ',');
  if (item.unidad === 'unidad') return n;
  if (item.unidad === 'paquete') return `${n} ${item.cantidad === 1 ? 'paquete' : 'paquetes'}`;
  return `${n} ${item.unidad}`;
}

// Sube o baja la cantidad con los botones − / + (sin bajar de 1).
export function ajustarCantidadItem(cantidad: number, delta: number): number {
  return Math.max(Math.round((cantidad + delta) * 1000) / 1000, 1);
}

// --- Base de datos -----------------------------------------------------------

// Filtra por hogar explícito (no solo RLS: un admin ve todos los hogares,
// ver docs/incidentes-sprint2.md #2).
export async function listarLista(hogarId: string): Promise<ItemListaCompras[]> {
  const { data, error } = await supabase
    .from('lista_compras')
    .select('*')
    .eq('hogar_id', hogarId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function agregarItems(hogarId: string, items: NuevoItem[], usuarioId: string): Promise<void> {
  if (items.length === 0) return;
  for (const item of items) {
    const problema = validarItem(item);
    if (problema) throw new Error(problema);
  }
  const { error } = await supabase.from('lista_compras').insert(
    items.map((i) => ({
      hogar_id: hogarId,
      nombre: i.nombre.trim(),
      cantidad: i.cantidad,
      unidad: i.unidad,
      categoria: i.categoria,
      catalogo_id: i.catalogoId,
      creado_por: usuarioId,
    })),
  );
  if (error) throw error;
}

export async function marcarComprado(id: string, comprado: boolean): Promise<void> {
  const { error } = await supabase.from('lista_compras').update({ comprado }).eq('id', id);
  if (error) throw error;
}

export async function cambiarCantidadItem(id: string, cantidad: number): Promise<void> {
  const { error } = await supabase.from('lista_compras').update({ cantidad }).eq('id', id);
  if (error) throw error;
}

export async function eliminarItems(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from('lista_compras').delete().in('id', ids);
  if (error) throw error;
}

/**
 * "Guardé las compras": carga en la despensa cada ítem tildado (con las
 * mismas reglas que el alta manual: si ya hay uno idéntico, le suma la
 * cantidad) y saca de la lista los que se guardaron. Los que fallen quedan
 * en la lista, tildados, para reintentar.
 */
export async function guardarComprasEnDespensa(
  hogarId: string,
  items: ItemListaCompras[],
): Promise<{ guardados: number; fallidos: number }> {
  const comprados = items.filter((i) => i.comprado);
  const guardados: string[] = [];
  for (const item of comprados) {
    try {
      await crearProducto(hogarId, {
        nombre: item.nombre,
        categoria: item.categoria,
        unidad: item.unidad,
        cantidad: item.cantidad,
        stockMinimo: 0,
        fechaVencimiento: null,
        alertaVencimientoHabilitada: true,
        catalogoId: item.catalogo_id,
      });
      guardados.push(item.id);
    } catch (err) {
      console.warn('[Stocky] No se pudo cargar en la despensa:', item.nombre, err);
    }
  }
  await eliminarItems(guardados);
  return { guardados: guardados.length, fallidos: comprados.length - guardados.length };
}

/**
 * true si, después de restar, ya no queda nada de ese producto en la
 * despensa (sumando todos sus lotes: mismo nombre y unidad). Ahí la app
 * ofrece pasarlo a la lista de compras.
 */
export function seTermino(producto: Pick<ItemListaCompras, 'nombre' | 'unidad'>, productos: { nombre: string; unidad: UnidadProducto; cantidad: number }[]): boolean {
  const clave = claveItem(producto);
  return !productos.some((p) => claveItem(p) === clave && p.cantidad > 0);
}

// Un producto de la despensa como ítem de la lista: la cantidad sugerida es
// su stock mínimo (lo que se quiere tener), o 1 si no tiene.
export function itemDesdeProducto(p: {
  nombre: string;
  unidad: UnidadProducto;
  categoria: string | null;
  catalogo_id: string | null;
  stock_minimo: number;
}): NuevoItem {
  return {
    nombre: p.nombre,
    cantidad: p.stock_minimo > 0 ? p.stock_minimo : 1,
    unidad: p.unidad,
    categoria: p.categoria ?? 'Otros',
    catalogoId: p.catalogo_id,
  };
}

// Agrega un producto que se terminó, salvo que ya esté en la lista.
// Devuelve false si ya estaba.
export async function agregarSiFalta(hogarId: string, item: NuevoItem, usuarioId: string): Promise<boolean> {
  const actuales = await listarLista(hogarId);
  const clave = claveItem(item);
  if (actuales.some((i) => !i.comprado && claveItem(i) === clave)) return false;
  await agregarItems(hogarId, [item], usuarioId);
  return true;
}
