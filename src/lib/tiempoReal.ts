/**
 * Ayudas para reaccionar a cambios en tiempo real (Supabase Realtime).
 *
 * Cuando otra persona del hogar agrega, cambia o borra productos, a cada
 * celular le llega un aviso por cada fila tocada (un ticket de 10 productos
 * = 10 avisos seguidos). En vez de recargar la lista 10 veces, se agrupan:
 * `agruparLlamadas` espera un momento de calma y recarga una sola vez.
 */

export interface LlamadaAgrupada {
  // Pide ejecutar la función; si llegan varios pedidos seguidos, se ejecuta
  // una sola vez, `esperaMs` después del último.
  disparar: () => void;
  // Descarta un pedido pendiente (al salir de la pantalla).
  cancelar: () => void;
}

export function agruparLlamadas(fn: () => void, esperaMs = 400): LlamadaAgrupada {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    disparar: () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, esperaMs);
    },
    cancelar: () => {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

// Un DELETE de Realtime solo trae el id de la fila borrada (replica identity
// por defecto) y no se puede filtrar por hogar: se recarga solo si el
// producto borrado estaba en la lista que se está mostrando.
export function afectaBorrado(idBorrado: unknown, idsEnPantalla: Iterable<string>): boolean {
  if (typeof idBorrado !== 'string') return false;
  for (const id of idsEnPantalla) if (id === idBorrado) return true;
  return false;
}
