/**
 * Tests de la lógica de FilaDeslizable: qué acción dispara soltar el dedo.
 */
import { accionDelDeslizamiento, UMBRAL_DESLIZAR } from './filaDeslizable.logica';

describe('accionDelDeslizamiento', () => {
  it('a la izquierda pasado el umbral: Usé 1', () => {
    expect(accionDelDeslizamiento(-UMBRAL_DESLIZAR)).toBe('usarUno');
    expect(accionDelDeslizamiento(-200)).toBe('usarUno');
  });

  it('a la derecha pasado el umbral: Eliminar (la pantalla pide confirmación)', () => {
    expect(accionDelDeslizamiento(UMBRAL_DESLIZAR)).toBe('eliminar');
  });

  it('un arrastre corto (o un toque) no hace nada', () => {
    expect(accionDelDeslizamiento(0)).toBeNull();
    expect(accionDelDeslizamiento(40)).toBeNull();
    expect(accionDelDeslizamiento(-UMBRAL_DESLIZAR + 1)).toBeNull();
  });
});
