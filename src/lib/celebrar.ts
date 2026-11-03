/**
 * Animación corta de "¡Listo!" al terminar algo grande (cargar un ticket,
 * aplicar lo dicho por voz, vaciar los vencidos), como el festejo de Todoist
 * al completar una tarea. Mismo esquema que alert.ts: CelebracionHost
 * (montado una vez en App.tsx) se registra acá y `celebrar()` lo dispara
 * desde cualquier pantalla. Sin host (tests) no hace nada.
 */
type Disparar = (texto: string) => void;

let host: Disparar | null = null;

export function registrarHostDeCelebracion(nuevo: Disparar): () => void {
  host = nuevo;
  return () => {
    if (host === nuevo) host = null;
  };
}

export function celebrar(texto = '¡Listo!'): void {
  host?.(texto);
}
