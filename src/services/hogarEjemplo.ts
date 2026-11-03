import { supabase } from '../lib/supabase';
import type { UnidadProducto } from '../types/database';
import { crearHogar, salirDeHogar } from './hogares';
import type { HogarConRol } from './hogares';
import { formatearFechaISO } from './productos';

/**
 * Hogar de ejemplo (como las plantillas de Notion): un hogar con productos
 * de muestra para probar Stocky sin miedo a romper nada, que después se
 * borra con un toque. Se ofrece al final del tutorial y desde la Ayuda ("?").
 *
 * Se reconoce por el nombre (no por algo guardado en el celular), así se
 * puede borrar desde cualquier dispositivo. Al borrarlo se eliminan sus
 * productos y la persona sale del hogar, igual que "Salir" de cualquier
 * hogar (la fila del hogar queda sin miembros, como pasa hoy).
 */
export const NOMBRE_HOGAR_EJEMPLO = 'Hogar de ejemplo 🧪';

export function esHogarDeEjemplo(hogar: { nombre: string }): boolean {
  return hogar.nombre === NOMBRE_HOGAR_EJEMPLO;
}

// El hogar de ejemplo de la persona (si es la dueña), o null.
export function buscarHogarDeEjemplo(hogares: HogarConRol[]): HogarConRol | null {
  return hogares.find((h) => esHogarDeEjemplo(h) && h.miRol === 'dueno') ?? null;
}

interface ProductoDeEjemplo {
  hogar_id: string;
  nombre: string;
  categoria: string;
  unidad: UnidadProducto;
  cantidad: number;
  stock_minimo: number;
  fecha_vencimiento: string | null;
  alerta_vencimiento_habilitada: boolean;
  marca: string | null;
}

// Fecha a `dias` de hoy (negativo = en el pasado).
function enDias(hoy: Date, dias: number): string {
  const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
  return formatearFechaISO(fecha);
}

// Productos de muestra pensados para ver todo lo que hace la app: uno
// vencido (rojo), dos por vencer (amarillo), uno con stock bajo, uno
// agotado y varios que están bien (verde). Nombres del catálogo, así se ven
// con su foto.
export function productosDeEjemplo(hogarId: string, hoy: Date = new Date()): ProductoDeEjemplo[] {
  const p = (
    nombre: string,
    categoria: string,
    unidad: UnidadProducto,
    cantidad: number,
    vence: number | null,
    extra: Partial<ProductoDeEjemplo> = {},
  ): ProductoDeEjemplo => ({
    hogar_id: hogarId,
    nombre,
    categoria,
    unidad,
    cantidad,
    stock_minimo: 0,
    fecha_vencimiento: vence === null ? null : enDias(hoy, vence),
    alerta_vencimiento_habilitada: true,
    marca: null,
    ...extra,
  });
  return [
    p('Yogur', 'Lácteos', 'unidad', 2, -2),
    p('Leche', 'Lácteos', 'l', 2, 2, { marca: 'La Serenísima' }),
    p('Pan lactal', 'Panadería', 'paquete', 1, 4),
    p('Huevo', 'Almacén', 'unidad', 3, 20, { stock_minimo: 6 }),
    p('Fideos', 'Almacén', 'paquete', 2, 300, { marca: 'Lucchetti' }),
    p('Arroz', 'Almacén', 'kg', 1, 400),
    p('Manzana', 'Verduras y frutas', 'kg', 1, 10),
    p('Yerba', 'Infusiones', 'paquete', 0, null),
  ];
}

// Crea el hogar de ejemplo con sus productos. Los productos van directo a la
// base (no por crearProducto) porque el de muestra vencido no pasaría el
// aviso de salud: está para mostrar cómo se ve uno vencido.
export async function crearHogarDeEjemplo(): Promise<{ id: string; nombre: string }> {
  const hogar = await crearHogar(NOMBRE_HOGAR_EJEMPLO);
  const { error } = await supabase.from('productos').insert(productosDeEjemplo(hogar.id));
  if (error) {
    // Sin productos no sirve de ejemplo: se deshace el hogar.
    await salirDeHogar(hogar.id).catch(() => {});
    throw error;
  }
  return { id: hogar.id, nombre: hogar.nombre };
}

// Borra los productos del hogar de ejemplo y sale de él.
export async function borrarHogarDeEjemplo(hogarId: string): Promise<void> {
  const { error } = await supabase.from('productos').delete().eq('hogar_id', hogarId);
  if (error) throw error;
  await salirDeHogar(hogarId);
}
