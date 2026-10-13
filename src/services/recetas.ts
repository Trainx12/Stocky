import type { Producto } from '../types/database';
import { estadoVencimiento } from './productos';
import type { IngredienteParaRecetas, RecetaSugerida } from './externalApis';

/**
 * "¿Qué cocino con esto?" (botón en "Productos próximos a vencer" del
 * inicio): elige qué productos mandarle a la función `recetas` y limpia lo
 * que vuelve. La llamada en sí está en externalApis.sugerirRecetas.
 */

// Cuántos productos se mandan como mucho (los que vencen antes).
export const MAX_INGREDIENTES_RECETAS = 12;

/**
 * Solo lo que está POR VENCER (no lo ya vencido: no vamos a sugerir cocinar
 * algo vencido) y con cantidad, del que vence primero al último, sin
 * repetir el mismo producto.
 */
export function ingredientesParaRecetas(
  productos: Producto[],
  hoy: Date = new Date(),
  diasPorDefecto?: number | null,
): IngredienteParaRecetas[] {
  const vistos = new Set<string>();
  return productos
    .filter((p) => p.cantidad > 0 && p.fecha_vencimiento && estadoVencimiento(p, hoy, diasPorDefecto ?? undefined) === 'proximo')
    .sort((a, b) => (a.fecha_vencimiento ?? '').localeCompare(b.fecha_vencimiento ?? ''))
    .filter((p) => {
      const clave = p.nombre.trim().toLowerCase();
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    })
    .slice(0, MAX_INGREDIENTES_RECETAS)
    .map((p) => ({ nombre: p.nombre, cantidad: p.cantidad, unidad: p.unidad, vence: p.fecha_vencimiento }));
}

// Descarta recetas incompletas o raras que pueda devolver el modelo.
export function recetasValidas(recetas: unknown[]): RecetaSugerida[] {
  const textos = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((x) => x.trim()) : [];
  return recetas
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        titulo: typeof o.titulo === 'string' ? o.titulo.trim() : '',
        minutos: typeof o.minutos === 'number' && o.minutos > 0 ? Math.round(o.minutos) : null,
        usa: textos(o.usa),
        ademas: textos(o.ademas),
        pasos: textos(o.pasos),
      };
    })
    .filter((r) => r.titulo !== '' && r.pasos.length > 0 && r.usa.length > 0);
}
