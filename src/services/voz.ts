import type { Producto, ProductoCatalogo, UnidadProducto } from '../types/database';
import { buscarEnCatalogo, fechaDetectadaValida, normalizarNombre, UNIDADES_DISPONIBLES } from './escaneo';
import type { AccionDeVozInterpretada, ComandoDeVozInterpretado, ProductoParaVoz } from './externalApis';
import { crearProducto, editarProducto, eliminarProducto, formatearFechaISO, parsearNumero } from './productos';

/**
 * RF8 (Sprints 7/8) — ABM de productos por voz. Gemini devuelve qué entendió
 * (ver supabase/functions/voz-a-texto); acá se cruza eso con el inventario
 * del hogar y el catálogo para armar acciones revisables, y se aplican recién
 * cuando el usuario confirma en ComandoVozModal. Lógica pura (salvo
 * aplicarAccionDeVoz) para poder testearla con Jest, igual que escaneo.ts.
 */

export type TipoAccionVoz = AccionDeVozInterpretada['accion'];

// Una acción lista para revisar en pantalla. Los campos de texto son lo que
// el usuario puede corregir antes de confirmar:
//   - alta: cantidad a agregar, marca y vencimiento del producto nuevo.
//   - modificacion: cómo queda el producto (cantidad final, marca, fecha).
//   - baja: no se edita nada, solo se confirma o se descarta.
export interface AccionVoz {
  id: string;
  tipo: TipoAccionVoz;
  // Lo que dijo el usuario para identificar el producto ("yogur").
  nombreDicho: string;
  // alta: identidad del producto nuevo (del catálogo si coincide).
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  catalogo: ProductoCatalogo | null;
  // baja/modificacion: producto del hogar sobre el que se actúa. Null si no
  // se encontró o si hay varios posibles (ver `opciones`).
  producto: Producto | null;
  // Varios productos del hogar coinciden con lo dicho (misma leche, distinta
  // marca o vencimiento): el usuario elige cuál.
  opciones: Producto[];
  // Pedido de cantidad tal cual se dijo (modificacion), para recalcular la
  // cantidad final si el usuario elige otro producto de `opciones`.
  operacionCantidad: AccionDeVozInterpretada['operacion_cantidad'];
  cantidadDicha: number | null;
  // Marca y fecha tal cual se dijeron ('' = no se dijeron).
  marcaDicha: string;
  fechaDicha: string;
  cantidad: string;
  marca: string;
  fecha: string; // 'AAAA-MM-DD' o '' (sin fecha)
  incluir: boolean;
  aviso: string | null;
}

// Fecha de hoy en hora local, para que el modelo resuelva "mañana", "el viernes".
export function fechaDeHoy(hoy: Date = new Date()): string {
  return formatearFechaISO(hoy);
}

// Inventario reducido que se le manda al modelo.
export function inventarioParaVoz(productos: Producto[]): ProductoParaVoz[] {
  return productos.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    marca: p.marca,
    cantidad: p.cantidad,
    unidad: p.unidad,
    fecha_vencimiento: p.fecha_vencimiento,
  }));
}

// Evita arrastrar errores de coma flotante (0.1 + 0.2) a la cantidad.
function redondear(valor: number): number {
  return Math.round(valor * 1000) / 1000;
}

function capitalizar(texto: string): string {
  const limpio = texto.trim();
  return limpio.charAt(0).toUpperCase() + limpio.slice(1);
}

// Cantidad con la que queda un producto después de lo pedido por voz.
export function cantidadFinal(
  actual: number,
  operacion: AccionDeVozInterpretada['operacion_cantidad'],
  cantidad: number | null | undefined,
): number {
  if (operacion == null || cantidad == null || !Number.isFinite(cantidad)) return actual;
  if (operacion === 'fijar') return redondear(Math.max(cantidad, 0));
  if (operacion === 'sumar') return redondear(actual + cantidad);
  return redondear(Math.max(actual - cantidad, 0));
}

// Productos del hogar que coinciden con lo dicho. Primero por el id que
// eligió el modelo; si no vino o no existe, por nombre (tolerando plural y
// errores de una letra, igual que el ticket) y, si dijo marca, por marca.
export function buscarProductosDichos(
  interpretada: Pick<AccionDeVozInterpretada, 'producto_id' | 'nombre' | 'marca'>,
  productos: Producto[],
): Producto[] {
  const porId = interpretada.producto_id ? productos.find((p) => p.id === interpretada.producto_id) : undefined;
  if (porId) return [porId];

  const porNombre = productos.filter((p) => buscarEnCatalogo(interpretada.nombre ?? '', [p]) !== null);
  const marca = normalizarNombre(interpretada.marca ?? '');
  if (!marca) return porNombre;
  const porMarca = porNombre.filter((p) => normalizarNombre(p.marca ?? '') === marca);
  return porMarca.length > 0 ? porMarca : porNombre;
}

// Fecha dicha validada: si el modelo devolvió algo que no es una fecha real
// se descarta (mejor pedirla a mano que guardar una equivocada).
function fechaValida(fecha: string | null | undefined): string {
  return fechaDetectadaValida(fecha) ? fecha : '';
}

function unidadValida(unidad: string | null | undefined): UnidadProducto | null {
  return UNIDADES_DISPONIBLES.includes(unidad as UnidadProducto) ? (unidad as UnidadProducto) : null;
}

// Rellena los campos editables de una baja/modificación a partir del
// producto elegido (al armar la acción, o cuando el usuario elige entre
// `opciones`).
export function elegirProducto(accion: AccionVoz, producto: Producto): AccionVoz {
  return {
    ...accion,
    producto,
    nombre: producto.nombre,
    categoria: producto.categoria ?? '',
    unidad: producto.unidad,
    cantidad: String(cantidadFinal(producto.cantidad, accion.operacionCantidad, accion.cantidadDicha)),
    marca: accion.marcaDicha || producto.marca || '',
    fecha: accion.fechaDicha || producto.fecha_vencimiento || '',
    incluir: true,
    aviso: null,
  };
}

function armarAccion(interpretada: AccionDeVozInterpretada, indice: number, productos: Producto[], catalogo: ProductoCatalogo[]): AccionVoz {
  const nombreDicho = capitalizar(interpretada.nombre ?? '');
  const fechaDicha = fechaValida(interpretada.fecha_vencimiento);
  const avisoFecha =
    interpretada.fecha_vencimiento && !fechaDicha ? 'No entendimos bien la fecha, cargala a mano si hace falta.' : null;

  const base: AccionVoz = {
    id: `${indice}-${interpretada.accion}-${nombreDicho}`,
    tipo: interpretada.accion,
    nombreDicho,
    nombre: nombreDicho,
    categoria: 'Otros',
    unidad: 'unidad',
    catalogo: null,
    producto: null,
    opciones: [],
    operacionCantidad: interpretada.operacion_cantidad ?? null,
    cantidadDicha: typeof interpretada.cantidad === 'number' ? interpretada.cantidad : null,
    marcaDicha: interpretada.marca?.trim() ?? '',
    fechaDicha,
    cantidad: '',
    marca: interpretada.marca?.trim() ?? '',
    fecha: fechaDicha,
    incluir: true,
    aviso: avisoFecha,
  };

  if (interpretada.accion === 'alta') {
    const enCatalogo = buscarEnCatalogo(nombreDicho, catalogo);
    return {
      ...base,
      nombre: enCatalogo?.nombre ?? nombreDicho,
      categoria: enCatalogo?.categoria ?? 'Otros',
      // La unidad de un producto del catálogo es parte de su identidad; la
      // dicha solo se usa para lo que no está en el catálogo.
      unidad: enCatalogo?.unidad ?? unidadValida(interpretada.unidad) ?? 'unidad',
      catalogo: enCatalogo,
      cantidad: String(base.cantidadDicha != null && base.cantidadDicha > 0 ? redondear(base.cantidadDicha) : 1),
      incluir: nombreDicho !== '',
    };
  }

  const encontrados = buscarProductosDichos(interpretada, productos);
  if (encontrados.length === 1) {
    return { ...elegirProducto(base, encontrados[0]), aviso: avisoFecha };
  }
  if (encontrados.length > 1) {
    return {
      ...base,
      opciones: encontrados,
      incluir: false,
      aviso: `Hay ${encontrados.length} productos "${nombreDicho}" en la despensa: elegí a cuál te referís.`,
    };
  }
  return {
    ...base,
    incluir: false,
    aviso: `No encontramos "${nombreDicho}" en la despensa.`,
  };
}

// Convierte lo que devolvió voz-a-texto en acciones revisables.
export function armarAccionesDeVoz(
  comando: ComandoDeVozInterpretado,
  productos: Producto[],
  catalogo: ProductoCatalogo[],
): AccionVoz[] {
  return comando.acciones
    .filter((a) => a && (a.accion === 'alta' || a.accion === 'baja' || a.accion === 'modificacion'))
    .map((a, indice) => armarAccion(a, indice, productos, catalogo));
}

// Una acción se puede aplicar si está marcada y tiene todo lo necesario.
export function accionAplicable(accion: AccionVoz): boolean {
  if (!accion.incluir) return false;
  if (accion.tipo === 'alta') return accion.nombre.trim() !== '';
  return accion.producto !== null;
}

// Aplica una acción ya confirmada sobre `productos`. Reutiliza las mismas
// funciones que el alta/edición manual, así que valida igual (cantidades
// negativas, fechas inválidas) y el alta suma al producto idéntico existente.
export async function aplicarAccionDeVoz(hogarId: string, accion: AccionVoz): Promise<void> {
  if (accion.tipo === 'alta') {
    await crearProducto(hogarId, {
      nombre: accion.nombre,
      categoria: accion.categoria,
      unidad: accion.unidad,
      cantidad: parsearNumero(accion.cantidad),
      stockMinimo: 0,
      fechaVencimiento: accion.fecha || null,
      alertaVencimientoHabilitada: true,
      catalogoId: accion.catalogo?.id ?? null,
      marca: accion.marca,
    });
    return;
  }

  const producto = accion.producto;
  if (!producto) throw new Error(`No se encontró "${accion.nombreDicho}" en la despensa.`);

  if (accion.tipo === 'baja') {
    await eliminarProducto(producto.id);
    return;
  }

  await editarProducto(producto.id, {
    nombre: producto.nombre,
    categoria: producto.categoria ?? '',
    unidad: producto.unidad,
    cantidad: parsearNumero(accion.cantidad),
    stockMinimo: producto.stock_minimo,
    fechaVencimiento: accion.fecha || null,
    alertaVencimientoHabilitada: producto.alerta_vencimiento_habilitada,
    catalogoId: producto.catalogo_id,
    marca: accion.marca,
  });
}
