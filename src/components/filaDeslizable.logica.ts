// Lógica pura de FilaDeslizable (sin React), para poder testearla con Jest.

// Cuánto hay que arrastrar (en px) para que el gesto cuente.
export const UMBRAL_DESLIZAR = 90;

export type AccionDeslizar = 'usarUno' | 'eliminar' | null;

// Al soltar: hacia la izquierda pasado el umbral es "Usé 1", hacia la derecha
// es "Eliminar"; si no llegó, no pasa nada.
export function accionDelDeslizamiento(dx: number, umbral: number = UMBRAL_DESLIZAR): AccionDeslizar {
  if (dx <= -umbral) return 'usarUno';
  if (dx >= umbral) return 'eliminar';
  return null;
}
