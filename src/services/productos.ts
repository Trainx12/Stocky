import { supabase } from '../lib/supabase';
import type { Producto, UnidadProducto } from '../types/database';

/**
 * RF7 — ABM de productos de un hogar. A diferencia de hogares.ts, acá no
 * hace falta ninguna RPC: cada operación toca una sola fila de una sola
 * tabla, y la policy de RLS de "productos" (ver migración
 * 20260826130000_hogares_multi_membresia.sql) ya exige ser miembro del
 * hogar (`hogar_id_actual()` o `es_miembro_de(hogar_id)`) o admin, así que
 * no hace falta duplicar esa validación acá — mismo criterio que
 * editarHogar() en hogares.ts.
 */

// Campos que completa el usuario al crear o editar un producto. Los que no
// dependen de RF2/RF3 (fecha_vencimiento, alerta_vencimiento_habilitada) no
// se tocan todavía: quedan con su default de la base hasta ese sprint.
export interface DatosProducto {
  nombre: string;
  // Obligatoria a propósito: todo producto tiene que quedar clasificado
  // para que el filtro por categoría de ProductosScreen sea útil (un
  // "Otros" elegido a mano sigue siendo una categoría real, a diferencia
  // de dejarlo vacío).
  categoria: string;
  unidad: UnidadProducto;
  cantidad: number;
  stockMinimo: number;
}

// Valida los campos comunes a crear/editar antes de pegarle a Supabase:
// nombre/categoría vacíos o cantidades negativas no tienen que llegar a la
// base (ver docs/plan-de-testing.md, Sprint 3: "cantidades negativas
// deberían rechazarse, no romper la UI").
function validar(datos: DatosProducto): { nombre: string; categoria: string; cantidad: number; stockMinimo: number } {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error('El nombre del producto no puede estar vacío');

  const categoria = datos.categoria.trim();
  if (!categoria) throw new Error('Elegí una categoría para el producto');

  if (datos.cantidad < 0) throw new Error('La cantidad no puede ser negativa');
  if (datos.stockMinimo < 0) throw new Error('El stock mínimo no puede ser negativo');

  return { nombre, categoria, cantidad: datos.cantidad, stockMinimo: datos.stockMinimo };
}

// Lista los productos de un hogar puntual. Filtra explícito por hogar_id
// (no alcanza con dejar que la RLS filtre sola): un admin puede ver
// productos de CUALQUIER hogar vía es_administrador(), así que sin este
// .eq() esta pantalla ("productos de ESTE hogar") podría devolver mezclado
// el inventario de otro hogar si la llamara una cuenta admin -- mismo
// patrón de bug que ya se encontró con listarMisHogares (ver
// docs/incidentes-sprint2.md #2).
export async function listarProductos(hogarId: string): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .eq('hogar_id', hogarId)
    .order('nombre', { ascending: true });

  if (error) throw error;
  return data ?? [];
}

// Crea un producto nuevo en un hogar puntual.
export async function crearProducto(hogarId: string, datos: DatosProducto): Promise<Producto> {
  const { nombre, categoria, cantidad, stockMinimo } = validar(datos);

  const { data, error } = await supabase
    .from('productos')
    .insert({
      hogar_id: hogarId,
      nombre,
      categoria,
      unidad: datos.unidad,
      cantidad,
      stock_minimo: stockMinimo,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Edita un producto existente (nombre, categoría, unidad, cantidad, stock
// mínimo). No hace falta pasar el hogar_id: la RLS ya rechaza el update si
// el producto no pertenece a un hogar del que el usuario sea miembro.
export async function editarProducto(productoId: string, datos: DatosProducto): Promise<Producto> {
  const { nombre, categoria, cantidad, stockMinimo } = validar(datos);

  const { data, error } = await supabase
    .from('productos')
    .update({
      nombre,
      categoria,
      unidad: datos.unidad,
      cantidad,
      stock_minimo: stockMinimo,
    })
    .eq('id', productoId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Elimina un producto. Igual que editarProducto, la RLS es la que valida
// que el producto pertenezca a un hogar del que el usuario sea miembro.
export async function eliminarProducto(productoId: string): Promise<void> {
  const { error } = await supabase.from('productos').delete().eq('id', productoId);
  if (error) throw error;
}

/**
 * Lógica pura de ProductosScreen/ProductoFormModal, sacada acá para poder
 * testearla con Jest sin levantar un componente (este proyecto no tiene
 * infra de testing de componentes React Native, solo de lógica de
 * servicios -- ver README#tests).
 */

// Categorías realmente en uso en una lista de productos, sin duplicados y
// ordenadas alfabéticamente. La usa ProductosScreen para los chips del
// filtro (solo aparece un chip si hay al menos un producto con esa
// categoría) y ProductoFormModal para sumarlas como opción además de las
// sugeridas fijas.
export function categoriasEnUso(productos: Producto[]): string[] {
  const vistas = new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c));
  return Array.from(vistas).sort((a, b) => a.localeCompare(b));
}

// Filtra una lista de productos por texto libre (nombre, sin distinguir
// mayúsculas/minúsculas) y opcionalmente por categoría exacta. `categoria
// = null` significa "todas" (sin filtrar por categoría). 100% client-side
// a propósito: a la escala esperada (~20-30 productos por hogar, ver
// docs/plan-de-testing.md) no vale la pena ir a la base por cada letra
// tipeada.
export function filtrarProductos(productos: Producto[], busqueda: string, categoria: string | null): Producto[] {
  const busquedaNormalizada = busqueda.trim().toLowerCase();
  return productos.filter((p) => {
    const coincideBusqueda = !busquedaNormalizada || p.nombre.toLowerCase().includes(busquedaNormalizada);
    const coincideCategoria = !categoria || p.categoria === categoria;
    return coincideBusqueda && coincideCategoria;
  });
}

// Convierte el texto de un input numérico (cantidad/stock mínimo) a un
// número. Acepta coma o punto como separador decimal, para no obligar a
// escribir "en inglés". Texto inválido, vacío o infinito se interpreta
// como 0 en vez de tirar error: el input arranca en "0" y el usuario
// tiene que poder borrarlo entero a mitad de tipeo sin que la UI se
// rompa (la validación real de negativos pasa por validar(), no por acá).
export function parsearNumero(texto: string): number {
  const valor = Number(texto.replace(',', '.'));
  return Number.isFinite(valor) ? valor : 0;
}
