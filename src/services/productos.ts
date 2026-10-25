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
  // De qué fila de productos_catalogo salieron nombre/categoria/unidad
  // (ver ProductoFormModal / CatalogoSelectorModal, y la migración
  // 20260909212018_catalogo_productos.sql). Null en productos que ya
  // existían antes del catálogo.
  catalogoId: string | null;
  // Marca opcional en texto libre (ver migración 20260912120000_productos_marca.sql).
  marca?: string | null;
  // Opcional: con cuántos días de anticipación avisar que vence ESTE
  // producto (1-60). Null/undefined = usar la preferencia general del
  // usuario (usuarios.dias_aviso_vencimiento). Ver migración
  // 20261012120000_notificaciones.sql.
  diasAvisoVencimiento?: number | null;
}

// Rango permitido para los días de aviso (mismo check que la base).
export const DIAS_AVISO_MINIMO = 1;
export const DIAS_AVISO_MAXIMO = 60;

// Suma `delta` a los días de aviso sin salirse del rango permitido (los
// botones − / + de la campanita).
export function ajustarDiasAviso(dias: number, delta: number): number {
  return Math.min(DIAS_AVISO_MAXIMO, Math.max(DIAS_AVISO_MINIMO, dias + delta));
}

// true si `dias` es un valor válido de días de aviso: entero entre 1 y 60.
export function esDiasAvisoValido(dias: number): boolean {
  return Number.isInteger(dias) && dias >= DIAS_AVISO_MINIMO && dias <= DIAS_AVISO_MAXIMO;
}

// Texto del campo "Días de anticipación (opcional)" del formulario -> valor
// para guardar: vacío = null (usar la preferencia general). Cualquier otra
// cosa se devuelve como número aunque esté fuera de rango (0, 99): la
// validación con mensaje legible la hace validar() al guardar.
export function parsearDiasAviso(texto: string): number | null {
  const limpio = texto.trim();
  return limpio === '' ? null : Number(limpio);
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

// Aviso de salud: no se puede cargar un producto que ya venció (antes se
// cargaba sin decir nada). Lo usan crearProducto/editarProducto (así vale
// para la carga a mano, por voz y por ticket) y los formularios, para
// avisar apenas se escribe la fecha.
export function avisoProductoVencido(
  fechaNueva: string | null | undefined,
  fechaAnterior: string | null | undefined = null,
  hoy: Date = new Date(),
): string | null {
  const fecha = fechaNueva?.trim() ? aFechaISO(fechaNueva) : null;
  if (!fecha || !esFechaValida(fecha)) return null;
  // Editar un producto que ya estaba vencido (por ejemplo, para bajarle la
  // cantidad) se permite: solo se frena PONER una fecha pasada.
  if (fecha === fechaAnterior) return null;
  const hoySinHora = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (parsearFechaLocal(fecha) >= hoySinHora) return null;
  return `Este producto venció el ${formatearFechaCorta(fecha)}. Por tu salud, no lo consumas: los productos vencidos no se pueden cargar. Si la fecha está mal, corregila.`;
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
  marca: string | null;
  diasAvisoVencimiento: number | null;
} {
  const nombre = capitalizar(datos.nombre.trim());
  if (!nombre) throw new Error('El nombre del producto no puede estar vacío');

  const categoria = datos.categoria.trim();
  if (!categoria) throw new Error('Elegí una categoría para el producto');

  if (datos.cantidad < 0) throw new Error('La cantidad no puede ser negativa');
  if (datos.stockMinimo < 0) throw new Error('El stock mínimo no puede ser negativo');

  const fechaVencimiento = datos.fechaVencimiento?.trim() ? aFechaISO(datos.fechaVencimiento) : null;
  if (fechaVencimiento && !esFechaValida(fechaVencimiento)) {
    throw new Error('La fecha de vencimiento no está completa o no existe (DD/MM/AAAA)');
  }

  const marca = datos.marca?.trim() || null;
  if (marca && marca.length > 40) throw new Error('La marca no puede tener más de 40 caracteres');

  const diasAvisoVencimiento = datos.diasAvisoVencimiento ?? null;
  if (diasAvisoVencimiento !== null && !esDiasAvisoValido(diasAvisoVencimiento)) {
    throw new Error(`Los días de aviso tienen que ser un número entero entre ${DIAS_AVISO_MINIMO} y ${DIAS_AVISO_MAXIMO}`);
  }

  return {
    nombre,
    categoria,
    cantidad: datos.cantidad,
    stockMinimo: datos.stockMinimo,
    fechaVencimiento,
    marca,
    diasAvisoVencimiento,
  };
}

// Minúsculas, sin tildes ni espacios de más: "Lucchetti " ~ "lucchetti".
function normalizarTexto(texto: string | null | undefined): string {
  return (texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Nombre para mostrar en listas: "Fideos · Lucchetti" cuando tiene marca, así
// dos paquetes del mismo producto se distinguen a simple vista.
export function nombreConMarca(producto: Pick<Producto, 'nombre' | 'marca'>): string {
  return producto.marca ? `${producto.nombre} · ${producto.marca}` : producto.nombre;
}

// Busca entre los productos de un hogar uno que sea "el mismo" que el que se
// está por crear: misma identidad (producto del catálogo, o mismo nombre si
// no viene de catálogo), misma unidad, misma marca y mismo vencimiento. Si
// existe, conviene sumarle la cantidad en vez de crear una fila repetida.
// La unidad cuenta porque 1 l de chocolatada (líquida) y 1 paquete (en
// polvo) son cosas distintas: antes se sumaban y quedaba "2 l"
// (incidentes-sprint10.md #22).
export function buscarDuplicado(
  existentes: Producto[],
  nuevo: {
    nombre: string;
    catalogoId: string | null;
    unidad: UnidadProducto;
    marca: string | null;
    fechaVencimiento: string | null;
  },
): Producto | null {
  const marcaNueva = normalizarTexto(nuevo.marca);
  const nombreNuevo = normalizarTexto(nuevo.nombre);

  return (
    existentes.find((p) => {
      const mismaIdentidad = nuevo.catalogoId
        ? p.catalogo_id === nuevo.catalogoId
        : p.catalogo_id === null && normalizarTexto(p.nombre) === nombreNuevo;
      return (
        mismaIdentidad &&
        p.unidad === nuevo.unidad &&
        normalizarTexto(p.marca) === marcaNueva &&
        (p.fecha_vencimiento ?? null) === (nuevo.fechaVencimiento ?? null)
      );
    }) ?? null
  );
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
// Si ya hay en el hogar un producto idéntico (mismo producto, misma marca y
// mismo vencimiento) y se agrega con cantidad, se le suma en vez de crear una
// fila repetida -- la base solo guarda filas distintas cuando hay algo
// distinto que distinguir (otra marca u otra fecha).
export async function crearProducto(hogarId: string, datos: DatosProducto): Promise<Producto> {
  const { nombre, categoria, cantidad, stockMinimo, fechaVencimiento, marca, diasAvisoVencimiento } = validar(datos);
  const vencido = avisoProductoVencido(fechaVencimiento);
  if (vencido) throw new Error(vencido);

  if (cantidad > 0) {
    const duplicado = buscarDuplicado(await listarProductos(hogarId), {
      nombre,
      catalogoId: datos.catalogoId,
      unidad: datos.unidad,
      marca,
      fechaVencimiento,
    });
    if (duplicado) return ajustarCantidadProducto(duplicado.id, cantidad);
  }

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
      catalogo_id: datos.catalogoId,
      marca,
      dias_aviso_vencimiento: diasAvisoVencimiento,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Edita un producto existente (nombre, categoría, unidad, cantidad, stock
// mínimo). No hace falta pasar el hogar_id: la RLS ya rechaza el update si
// el producto no pertenece a un hogar del que el usuario sea miembro.
// `catalogoId` no se toca acá a propósito: la identidad del producto
// (nombre/categoría/unidad/catálogo) queda fija desde que se crea, editar
// solo cambia cantidad/stock/vencimiento (ver ProductoFormModal).
// `fechaAnterior`: la fecha que ya tenía el producto (dejarla como está se
// permite aunque ya haya pasado, ver avisoProductoVencido).
export async function editarProducto(
  productoId: string,
  datos: DatosProducto,
  fechaAnterior: string | null = null,
): Promise<Producto> {
  const { nombre, categoria, cantidad, stockMinimo, fechaVencimiento, marca, diasAvisoVencimiento } = validar(datos);
  const vencido = avisoProductoVencido(fechaVencimiento, fechaAnterior);
  if (vencido) throw new Error(vencido);

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
      marca,
      dias_aviso_vencimiento: diasAvisoVencimiento,
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

// Productos que se pueden limpiar de la lista: se acabaron (cantidad 0) y no
// tienen stock mínimo. Los agotados CON stock mínimo se dejan a propósito:
// ese 0 es la señal de "hay que reponerlo".
export function productosAgotadosLimpiables(productos: Producto[]): Producto[] {
  return productos.filter((p) => p.cantidad === 0 && p.stock_minimo === 0);
}

// Borra del hogar los productos agotados limpiables (ver arriba). Devuelve
// los que borró (para poder deshacerlo, ver restaurarProductos). Filtra por
// hogar_id explícito (no solo RLS), igual que listarProductos.
export async function eliminarProductosAgotados(hogarId: string): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .delete()
    .eq('hogar_id', hogarId)
    .eq('cantidad', 0)
    .eq('stock_minimo', 0)
    .select('*');

  if (error) throw error;
  return data ?? [];
}

// "Deshacer" después de borrar: vuelve a crear las filas tal cual estaban
// (mismo id, cantidad, fecha...). No pasa por crearProducto a propósito: no
// tiene que juntarlas con otras ni frenar las vencidas (estaban cargadas).
export async function restaurarProductos(productos: Producto[]): Promise<void> {
  if (productos.length === 0) return;
  const { error } = await supabase.from('productos').insert(productos);
  if (error) throw error;
}

// Productos que ya vencieron (la fecha pasó, sin contar hoy), tengan o no la
// alerta prendida: los que borra "Eliminar vencidos" del filtro "Por vencer".
export function productosVencidos(productos: Producto[], hoy: Date = new Date()): Producto[] {
  const hoyISO = formatearFechaISO(hoy);
  return productos.filter((p) => !!p.fecha_vencimiento && p.fecha_vencimiento < hoyISO);
}

// Borra del hogar todos los productos vencidos (mismo criterio que
// productosVencidos: fecha anterior a hoy). Devuelve los que borró (para
// "Deshacer"). Filtra por hogar_id explícito (no solo RLS), igual que
// eliminarProductosAgotados.
export async function eliminarProductosVencidos(hogarId: string, hoy: Date = new Date()): Promise<Producto[]> {
  const { data, error } = await supabase
    .from('productos')
    .delete()
    .eq('hogar_id', hogarId)
    .lt('fecha_vencimiento', formatearFechaISO(hoy))
    .select('*');

  if (error) throw error;
  return data ?? [];
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
    // También por marca: "red premium" encuentra las manzanas de esa marca.
    const coincideBusqueda =
      !busquedaNormalizada ||
      p.nombre.toLowerCase().includes(busquedaNormalizada) ||
      (p.marca ?? '').toLowerCase().includes(busquedaNormalizada);
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

// Un producto tal como se muestra en la lista: todas las filas del mismo
// producto (misma identidad y unidad) juntas. Cada fila es un "lote" con su
// propia marca, cantidad y vencimiento -- en la base siguen separadas para que
// la alerta de vencimiento de cada una sea exacta, pero en pantalla se ven
// bajo un solo "Manzana" en vez de desparramadas por la lista.
export interface GrupoProductos {
  clave: string;
  nombre: string;
  categoria: string | null;
  unidad: UnidadProducto;
  cantidadTotal: number;
  lotes: Producto[];
}

// Lo más urgente primero: por fecha de vencimiento (los sin fecha al final),
// y a igual fecha por marca (los sin marca al final).
function compararLotes(a: Producto, b: Producto): number {
  if (a.fecha_vencimiento !== b.fecha_vencimiento) {
    if (!a.fecha_vencimiento) return 1;
    if (!b.fecha_vencimiento) return -1;
    return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
  }
  if (!a.marca !== !b.marca) return a.marca ? -1 : 1;
  return (a.marca ?? '').localeCompare(b.marca ?? '');
}

// Agrupa por nombre (sin distinguir mayúsculas/tildes) y unidad: "3 kg de
// papa" y "2 paquetes de papa" no se suman, quedan como grupos distintos.
// Respeta el orden en que vienen los productos (alfabético desde la base).
export function agruparProductos(productos: Producto[]): GrupoProductos[] {
  const grupos = new Map<string, GrupoProductos>();
  for (const producto of productos) {
    const clave = `${normalizarTexto(producto.nombre)}|${producto.unidad}`;
    const grupo = grupos.get(clave);
    if (grupo) {
      grupo.lotes.push(producto);
      grupo.cantidadTotal = Math.round((grupo.cantidadTotal + producto.cantidad) * 1000) / 1000;
    } else {
      grupos.set(clave, {
        clave,
        nombre: producto.nombre,
        categoria: producto.categoria,
        unidad: producto.unidad,
        cantidadTotal: producto.cantidad,
        lotes: [producto],
      });
    }
  }
  return Array.from(grupos.values()).map((grupo) => ({ ...grupo, lotes: ordenarLotes(grupo.lotes) }));
}

// Copia ordenada con lo más urgente primero (ver compararLotes). La usa
// también el ABM por voz para descontar del lote que vence antes.
export function ordenarLotes(lotes: Producto[]): Producto[] {
  return [...lotes].sort(compararLotes);
}

/**
 * Alerta de stock mínimo (RF9/Sprint 8-9). `productos.stock_minimo` existe
 * desde el Sprint 1 y ya se cargaba en ProductoFormModal, pero nada lo
 * miraba. Se evalúa por PRODUCTO (el grupo de lotes de agruparProductos), no
 * por lote: si tengo 1 leche que vence mañana y 4 que vencen en un mes, con
 * mínimo 3 no me falta leche, aunque un lote suelto tenga 1.
 */

export type EstadoStock = 'bajo' | 'agotado';

// "Por debajo del mínimo" es ESTRICTO (cantidad < mínimo): con mínimo 3 y 3
// unidades no hay alerta, con 2 sí -- el mínimo es lo que quiero tener como
// piso, tenerlo justo no es una falta (ver docs/plan-de-testing.md, Sprint 8:
// probar el valor exacto, uno arriba y uno abajo). Sin mínimo cargado (0) nunca
// hay alerta, ni siquiera agotado: ese producto no pidió seguimiento.
export function estadoStock(cantidad: number, stockMinimo: number): EstadoStock | null {
  if (!(stockMinimo > 0)) return null;
  if (cantidad <= 0) return 'agotado';
  if (cantidad < stockMinimo) return 'bajo';
  return null;
}

// El mínimo de un producto con varios lotes: el mayor cargado entre sus
// lotes (lo normal es que esté en uno solo; si se cargó distinto en varios,
// se respeta el más exigente).
export function stockMinimoDelGrupo(grupo: Pick<GrupoProductos, 'lotes'>): number {
  return grupo.lotes.reduce((max, lote) => Math.max(max, lote.stock_minimo), 0);
}

// Estado de stock de un producto completo (total de sus lotes vs. su mínimo).
export function estadoStockDeGrupo(grupo: Pick<GrupoProductos, 'lotes' | 'cantidadTotal'>): EstadoStock | null {
  return estadoStock(grupo.cantidadTotal, stockMinimoDelGrupo(grupo));
}

// Texto del badge: "Sin stock" o "Stock bajo (mín. 3)". Como con
// etiquetaVencimiento, el color lo decide quien pinta (colors.stockStatus.low).
export function etiquetaStock(estado: EstadoStock | null, stockMinimo: number): string | null {
  if (estado === 'agotado') return 'Sin stock';
  if (estado === 'bajo') return `Stock bajo (mín. ${stockMinimo})`;
  return null;
}

// Un producto por debajo de su mínimo, para el dashboard.
export interface AlertaStock {
  clave: string;
  hogarId: string;
  nombre: string;
  unidad: UnidadProducto;
  cantidadTotal: number;
  stockMinimo: number;
  estado: EstadoStock;
}

// Productos con stock bajo o agotados de una lista que puede mezclar varios
// hogares: se agrupa por hogar (la misma "Leche" en dos hogares son dos
// alertas distintas). Lo más urgente primero: agotados, después los que
// tienen menos stock en proporción a su mínimo.
export function productosConStockBajo(productos: Producto[]): AlertaStock[] {
  const porHogar = new Map<string, Producto[]>();
  for (const p of productos) porHogar.set(p.hogar_id, [...(porHogar.get(p.hogar_id) ?? []), p]);

  const alertas: AlertaStock[] = [];
  for (const [hogarId, delHogar] of porHogar) {
    for (const grupo of agruparProductos(delHogar)) {
      const estado = estadoStockDeGrupo(grupo);
      if (!estado) continue;
      alertas.push({
        clave: `${hogarId}|${grupo.clave}`,
        hogarId,
        nombre: grupo.nombre,
        unidad: grupo.unidad,
        cantidadTotal: grupo.cantidadTotal,
        stockMinimo: stockMinimoDelGrupo(grupo),
        estado,
      });
    }
  }
  return alertas.sort((a, b) => a.cantidadTotal / a.stockMinimo - b.cantidadTotal / b.stockMinimo);
}

// Alertas de stock de varios hogares (los del usuario logueado). Trae TODOS
// los productos de esos hogares, no solo los que tienen mínimo: el total de
// un producto suma también los lotes sin mínimo cargado. Filtra por
// `hogarIds` explícito, no solo RLS (un admin ve todos los hogares -- ver
// docs/incidentes-sprint2.md #2).
export async function listarProductosConStockBajo(hogarIds: string[]): Promise<AlertaStock[]> {
  if (hogarIds.length === 0) return [];

  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .in('hogar_id', hogarIds)
    .order('nombre', { ascending: true });

  if (error) throw error;
  return productosConStockBajo(data ?? []);
}

// Texto del pie "Ver todos" de las tarjetas de alertas del Home: con varios
// hogares nombra a cuál lleva (la despensa es por hogar); con uno solo,
// muestra cuántas hay si no entran todas en la tarjeta (`maximo`).
export function textoVerTodos(total: number, hogarNombre: string | null, maximo: number): string {
  if (hogarNombre) return `Ver todos en ${hogarNombre}`;
  return total > maximo ? `Ver todos (${total})` : 'Ver en la despensa';
}

// 'AAAA-MM-DD' -> 'DD/MM/AAAA', como se lee una fecha en Argentina.
export function formatearFechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

// Campos de fecha en formato argentino (DD/MM/AAAA), como está impresa en el
// envase. En la base y en el estado de las pantallas la fecha completa sigue
// siendo 'AAAA-MM-DD'; mientras se tipea queda el texto a medias
// ('21/10/20'), que al guardar no pasa la validación.

// Lo que muestra el campo: una fecha completa en DD/MM/AAAA; cualquier otra
// cosa (vacío, a medio escribir) tal cual.
export function fechaParaMostrar(valor: string | null | undefined): string {
  if (!valor) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? formatearFechaCorta(valor) : valor;
}

// Lo que se tipea -> lo que se guarda en el estado. Solo se escriben números;
// las barras se ponen solas ('2110' -> '21/10'). Con los 8 dígitos de una
// fecha real devuelve 'AAAA-MM-DD'.
export function fechaDesdeInput(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  const escrito = [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)].filter(Boolean).join('/');
  if (digitos.length < 8) return escrito;
  const iso = `${digitos.slice(4, 8)}-${digitos.slice(2, 4)}-${digitos.slice(0, 2)}`;
  return esFechaValida(iso) ? iso : escrito;
}

// Cualquier forma en que pueda venir una fecha (AAAA-MM-DD o DD/MM/AAAA) ->
// 'AAAA-MM-DD'. Si no es ninguna de las dos, devuelve el texto tal cual (y
// la validación lo rechaza).
export function aFechaISO(valor: string): string {
  const limpio = valor.trim();
  const argentina = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(limpio);
  return argentina ? `${argentina[3]}-${argentina[2]}-${argentina[1]}` : limpio;
}

/**
 * RF2/RF3 (Sprint 4) — vencimiento de productos: fecha manual + alerta
 * visual de productos próximos a vencer, con opción de deshabilitar la
 * alerta por producto puntual (ver docs/plan-de-testing.md, Sprint 4).
 */

// Formatea lo que el usuario va tipeando en el campo de fecha de
// vencimiento, insertando los guiones solo (AAAA-MM-DD) sin que tenga que
// escribirlos a mano. Se re-deriva de los dígitos en cada tecla (no
// concatena), así que también funciona bien al borrar: si el usuario borra
// el último dígito justo después de un guion, el guion desaparece con él
// en vez de quedar "pegado". Ignora cualquier caracter que no sea dígito
// (para que pegar una fecha con "/" también funcione) y trunca a 8 dígitos.
export function formatearFechaInput(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  return [digitos.slice(0, 4), digitos.slice(4, 6), digitos.slice(6, 8)].filter(Boolean).join('-');
}

// Convierte un Date a 'YYYY-MM-DD' usando sus componentes LOCALES, no
// `toISOString()` (que convierte a UTC y puede correr la fecha un día para
// atrás en cualquier zona horaria negativa, como Argentina). La usa
// CalendarioPicker para armar cada celda de la grilla y para volcar el día
// tocado al campo de texto de ProductoFormModal.
export function formatearFechaISO(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// Un día de la grilla de CalendarioPicker.
export interface DiaCalendario {
  fecha: string; // 'YYYY-MM-DD'
  dia: number; // día del mes (1-31), para mostrar en la celda
  enMesActual: boolean; // false para los días de relleno del mes anterior/siguiente
}

// Arma la grilla de un mes para CalendarioPicker: siempre 6 semanas (42
// días), empezando el lunes, rellenando con los días del mes anterior y
// siguiente que caen en esas semanas -- así la grilla nunca cambia de
// tamaño (evita que el calendario "salte" de alto al cambiar de mes según
// cuántos días tenga o en qué día de la semana caiga el 1°).
export function diasDelMesCalendario(anio: number, mesIndiceCero: number): DiaCalendario[] {
  const primerDiaMes = new Date(anio, mesIndiceCero, 1);
  // Date#getDay(): 0=domingo..6=sábado. Se convierte a "cuántos días
  // retroceder hasta el lunes anterior" (lunes=0 ... domingo=6), porque la
  // semana en la grilla arranca en lunes (convención local, no de EE.UU.).
  const offsetHastaElLunes = (primerDiaMes.getDay() + 6) % 7;
  const inicioGrilla = new Date(anio, mesIndiceCero, 1 - offsetHastaElLunes);

  return Array.from({ length: 42 }, (_, i) => {
    const fecha = new Date(inicioGrilla.getFullYear(), inicioGrilla.getMonth(), inicioGrilla.getDate() + i);
    return {
      fecha: formatearFechaISO(fecha),
      dia: fecha.getDate(),
      enMesActual: fecha.getMonth() === mesIndiceCero,
    };
  });
}

// Ventana de "próximo a vencer" por defecto: un producto entra en alerta si le
// quedan esta cantidad de días o menos. Desde las notificaciones (Sprint 10)
// cada usuario puede elegir otro valor general (usuarios.dias_aviso_vencimiento,
// que las pantallas pasan como `diasPorDefecto`) y cada producto el suyo
// propio (productos.dias_aviso_vencimiento), que tiene prioridad. Mismo
// default que la columna en la base.
export const DIAS_AVISO_POR_DEFECTO = 7;

// Días de aviso que corresponden a un producto: el suyo si lo tiene, si no
// la preferencia general. Misma regla que el job diario de vencimientos
// (generar_notificaciones_vencimiento en la migración de notificaciones).
export function diasAvisoDe(
  producto: { dias_aviso_vencimiento?: number | null },
  diasPorDefecto: number = DIAS_AVISO_POR_DEFECTO,
): number {
  return producto.dias_aviso_vencimiento ?? diasPorDefecto;
}

// Lo mínimo que hace falta de un producto para calcular su vencimiento.
type ProductoConVencimiento = Pick<Producto, 'fecha_vencimiento' | 'alerta_vencimiento_habilitada'> & {
  dias_aviso_vencimiento?: number | null;
};

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
  producto: ProductoConVencimiento,
  hoy: Date = new Date(),
  diasPorDefecto: number = DIAS_AVISO_POR_DEFECTO,
): EstadoVencimiento | null {
  if (!producto.alerta_vencimiento_habilitada || !producto.fecha_vencimiento) return null;

  const dias = diasHastaVencimiento(producto.fecha_vencimiento, hoy);
  if (dias < 0) return 'vencido';
  if (dias <= diasAvisoDe(producto, diasPorDefecto)) return 'proximo';
  return 'ok';
}

// Texto legible para el badge de vencimiento ("Vence hoy", "Vence en 3
// días", "Vencido hace 2 días"; si falta mucho, la fecha: "Vence el
// 10/03/2027"). Desde el semáforo también hay texto para 'ok' (badge verde).
// null con el mismo criterio que estadoVencimiento (no hay nada que mostrar). Separado de estadoVencimiento
// a propósito: qué estado es vs. cómo se lee son cosas distintas, y este
// texto no depende de ningún color de theme (lo decide quien lo pinta).
export function etiquetaVencimiento(
  producto: ProductoConVencimiento,
  hoy: Date = new Date(),
  diasPorDefecto: number = DIAS_AVISO_POR_DEFECTO,
): string | null {
  const estado = estadoVencimiento(producto, hoy, diasPorDefecto);
  if (!estado) return null;

  const dias = diasHastaVencimiento(producto.fecha_vencimiento as string, hoy);
  if (estado === 'vencido') {
    const diasVencido = Math.abs(dias);
    return diasVencido === 1 ? 'Vencido hace 1 día' : `Vencido hace ${diasVencido} días`;
  }
  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 60) return `Vence el ${formatearFechaCorta(producto.fecha_vencimiento as string)}`;
  return `Vence en ${dias} días`;
}

// Productos con alerta de vencimiento activa que están 'proximo' o
// 'vencido' (no 'ok' ni sin alerta), ordenados por fecha de vencimiento
// ascendente (lo más urgente primero). La usa el dashboard (HomeScreen,
// "Productos próximos a vencer") sobre una lista ya traída de la base.
export function productosProximosAVencer(
  productos: Producto[],
  hoy: Date = new Date(),
  diasPorDefecto: number = DIAS_AVISO_POR_DEFECTO,
): Producto[] {
  return productos
    .filter((p) => {
      const estado = estadoVencimiento(p, hoy, diasPorDefecto);
      return estado === 'proximo' || estado === 'vencido';
    })
    .sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''));
}

// Todos los productos que tienen fecha de vencimiento cargada, en el orden en
// que van a vencer (los ya vencidos primero, porque su fecha es la más vieja).
// La usa el filtro "Por vencer" de ProductosScreen: a diferencia de
// productosProximosAVencer (el dashboard, solo lo urgente), acá entra
// cualquier producto con fecha, aunque falte mucho o tenga la alerta apagada
// -- es la vista para planificar qué consumir primero. A igual fecha, por
// nombre, para que el orden sea estable.
export function productosConVencimiento(productos: Producto[]): Producto[] {
  return productos
    .filter((p) => !!p.fecha_vencimiento)
    .sort(
      (a, b) =>
        (a.fecha_vencimiento as string).localeCompare(b.fecha_vencimiento as string) || a.nombre.localeCompare(b.nombre),
    );
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
export async function listarProductosProximosAVencer(
  hogarIds: string[],
  diasPorDefecto: number = DIAS_AVISO_POR_DEFECTO,
): Promise<Producto[]> {
  if (hogarIds.length === 0) return [];

  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .in('hogar_id', hogarIds)
    .eq('alerta_vencimiento_habilitada', true)
    .not('fecha_vencimiento', 'is', null)
    .order('fecha_vencimiento', { ascending: true });

  if (error) throw error;
  return productosProximosAVencer(data ?? [], new Date(), diasPorDefecto);
}
