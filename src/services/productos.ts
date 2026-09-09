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

// Campos que completa el usuario al crear o editar un producto.
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
  // RF2/RF3 (Sprint 4): fecha de vencimiento cargada a mano ('YYYY-MM-DD')
  // o null si el producto no tiene seguimiento de vencimiento. Independiente
  // de alertaVencimientoHabilitada: se puede tener la fecha cargada y la
  // alerta apagada a propósito (ver estadoVencimiento más abajo).
  fechaVencimiento: string | null;
  alertaVencimientoHabilitada: boolean;
}

// Parsea 'YYYY-MM-DD' como Date en hora LOCAL a medianoche. `new
// Date('YYYY-MM-DD')` (sin descomponer) lo interpreta como UTC, lo que
// corre la fecha un día para atrás en cualquier zona horaria negativa
// (Argentina, UTC-3) -- por eso se arma con los componentes numéricos en
// vez de pasarle el string entero al constructor de Date.
function parsearFechaLocal(fecha: string): Date {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

// true si `fecha` tiene el formato 'YYYY-MM-DD' Y es una fecha real (Date
// "corrige" fechas imposibles como 31 de febrero en vez de rechazarlas, por
// eso se compara contra los componentes originales).
function esFechaValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const d = parsearFechaLocal(fecha);
  return d.getFullYear() === anio && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// Primera letra en mayúscula (el resto del texto queda tal cual se
// escribió, no fuerza minúsculas en el resto) -- así "mandarina" y
// "Mandarina" no quedan como dos productos "distintos" a simple vista en la
// lista solo por cómo los tipeó cada uno.
function capitalizar(texto: string): string {
  return texto.length === 0 ? texto : texto[0].toUpperCase() + texto.slice(1);
}

// Valida los campos comunes a crear/editar antes de pegarle a Supabase:
// nombre/categoría vacíos, cantidades negativas o una fecha de vencimiento
// con formato/valor inválido no tienen que llegar a la base (ver
// docs/plan-de-testing.md, Sprint 3: "cantidades negativas deberían
// rechazarse, no romper la UI"; mismo criterio para la fecha en Sprint 4).
function validar(datos: DatosProducto): {
  nombre: string;
  categoria: string;
  cantidad: number;
  stockMinimo: number;
  fechaVencimiento: string | null;
} {
  const nombre = capitalizar(datos.nombre.trim());
  if (!nombre) throw new Error('El nombre del producto no puede estar vacío');

  const categoria = datos.categoria.trim();
  if (!categoria) throw new Error('Elegí una categoría para el producto');

  if (datos.cantidad < 0) throw new Error('La cantidad no puede ser negativa');
  if (datos.stockMinimo < 0) throw new Error('El stock mínimo no puede ser negativo');

  const fechaVencimiento = datos.fechaVencimiento?.trim() || null;
  if (fechaVencimiento && !esFechaValida(fechaVencimiento)) {
    throw new Error('La fecha de vencimiento no es válida (formato AAAA-MM-DD)');
  }

  return { nombre, categoria, cantidad: datos.cantidad, stockMinimo: datos.stockMinimo, fechaVencimiento };
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
  const { nombre, categoria, cantidad, stockMinimo, fechaVencimiento } = validar(datos);

  const { data, error } = await supabase
    .from('productos')
    .insert({
      hogar_id: hogarId,
      nombre,
      categoria,
      unidad: datos.unidad,
      cantidad,
      stock_minimo: stockMinimo,
      fecha_vencimiento: fechaVencimiento,
      alerta_vencimiento_habilitada: datos.alertaVencimientoHabilitada,
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
  const { nombre, categoria, cantidad, stockMinimo, fechaVencimiento } = validar(datos);

  const { data, error } = await supabase
    .from('productos')
    .update({
      nombre,
      categoria,
      unidad: datos.unidad,
      cantidad,
      stock_minimo: stockMinimo,
      fecha_vencimiento: fechaVencimiento,
      alerta_vencimiento_habilitada: datos.alertaVencimientoHabilitada,
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

// Suma o resta `delta` a la cantidad actual (+1/-1 rápido desde la lista,
// sin abrir el formulario de editar). Va por RPC (ver migración
// 20260909020000_ajuste_rapido_y_delta_actividad.sql) y no por un
// `.update()` directo porque "sumar al valor actual" necesita leer y
// escribir de forma atómica -- si dos personas tocan +/- casi al mismo
// tiempo, un ida-y-vuelta desde el cliente podría perder uno de los dos
// cambios. La RPC ya evita que quede en negativo (greatest(..., 0)).
export async function ajustarCantidadProducto(productoId: string, delta: number): Promise<Producto> {
  const { data, error } = await supabase.rpc('ajustar_cantidad_producto', { p_producto_id: productoId, p_delta: delta });
  if (error) throw error;
  return data;
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

/**
 * RF2/RF3 (Sprint 4) — vencimiento de productos: fecha manual + alerta
 * visual de productos próximos a vencer, con opción de deshabilitar la
 * alerta por producto puntual (ver docs/plan-de-testing.md, Sprint 4).
 */

// Ventana de "próximo a vencer": un producto entra en alerta si le quedan
// esta cantidad de días o menos. Único lugar donde vive este umbral, para
// no tener que sincronizarlo entre ProductosScreen y HomeScreen si cambia.
const DIAS_PROXIMO_A_VENCER = 7;

const MS_POR_DIA = 1000 * 60 * 60 * 24;

// Diferencia en días de calendario entre `fecha` (YYYY-MM-DD) y `hoy`
// (positivo = la fecha todavía no llegó). Redondea sobre medianoche local
// de ambas fechas para no depender de la hora del día en que se ejecuta.
function diasHastaVencimiento(fecha: string, hoy: Date): number {
  const vencimiento = parsearFechaLocal(fecha);
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((vencimiento.getTime() - hoySinHora.getTime()) / MS_POR_DIA);
}

export type EstadoVencimiento = 'ok' | 'proximo' | 'vencido';

// Estado de vencimiento de un producto para pintar el badge/alerta visual.
// Devuelve null cuando no corresponde mostrar nada: sin fecha cargada, o
// con la alerta deshabilitada a propósito por el usuario (RF3) -- en
// cualquiera de los dos casos el producto no debe aparecer resaltado ni
// en ProductosScreen ni en "Productos próximos a vencer" del dashboard.
// `hoy` es un parámetro (default `new Date()`) para poder testear fechas
// límite sin mockear el reloj del sistema.
export function estadoVencimiento(
  producto: Pick<Producto, 'fecha_vencimiento' | 'alerta_vencimiento_habilitada'>,
  hoy: Date = new Date(),
): EstadoVencimiento | null {
  if (!producto.alerta_vencimiento_habilitada || !producto.fecha_vencimiento) return null;

  const dias = diasHastaVencimiento(producto.fecha_vencimiento, hoy);
  if (dias < 0) return 'vencido';
  if (dias <= DIAS_PROXIMO_A_VENCER) return 'proximo';
  return 'ok';
}

// Texto legible para el badge de vencimiento ("Vence hoy", "Vence en 3
// días", "Vencido hace 2 días"). null con el mismo criterio que
// estadoVencimiento (no hay nada que mostrar). Separado de estadoVencimiento
// a propósito: qué estado es vs. cómo se lee son cosas distintas, y este
// texto no depende de ningún color de theme (lo decide quien lo pinta).
export function etiquetaVencimiento(
  producto: Pick<Producto, 'fecha_vencimiento' | 'alerta_vencimiento_habilitada'>,
  hoy: Date = new Date(),
): string | null {
  const estado = estadoVencimiento(producto, hoy);
  if (estado !== 'proximo' && estado !== 'vencido') return null;

  const dias = diasHastaVencimiento(producto.fecha_vencimiento as string, hoy);
  if (estado === 'vencido') {
    const diasVencido = Math.abs(dias);
    return diasVencido === 1 ? 'Vencido hace 1 día' : `Vencido hace ${diasVencido} días`;
  }
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  return `Vence en ${dias} días`;
}

// Productos con alerta de vencimiento activa que están 'proximo' o
// 'vencido' (no 'ok' ni sin alerta), ordenados por fecha de vencimiento
// ascendente (lo más urgente primero). La usa el dashboard (HomeScreen,
// "Productos próximos a vencer") sobre una lista ya traída de la base.
export function productosProximosAVencer(productos: Producto[], hoy: Date = new Date()): Producto[] {
  return productos
    .filter((p) => {
      const estado = estadoVencimiento(p, hoy);
      return estado === 'proximo' || estado === 'vencido';
    })
    .sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''));
}

// Productos próximos a vencer o vencidos de varios hogares a la vez (los
// del usuario logueado), para el dashboard. Recibe `hogarIds` explícito en
// vez de dejar que la RLS filtre sola -- mismo motivo que listarProductos
// de arriba: una cuenta admin ve TODOS los hogares vía es_administrador(),
// así que sin el .in() acá el dashboard podría mezclar productos de
// hogares ajenos si lo abriera un admin (ver docs/incidentes-sprint2.md
// #2). El filtro de `alerta_vencimiento_habilitada`/`fecha_vencimiento` en
// la query es solo una optimización (traer menos filas); el filtro real de
// "próximo o vencido" lo hace productosProximosAVencer sobre el resultado.
export async function listarProductosProximosAVencer(hogarIds: string[]): Promise<Producto[]> {
  if (hogarIds.length === 0) return [];

  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .in('hogar_id', hogarIds)
    .eq('alerta_vencimiento_habilitada', true)
    .not('fecha_vencimiento', 'is', null)
    .order('fecha_vencimiento', { ascending: true });

  if (error) throw error;
  return productosProximosAVencer(data ?? []);
}
