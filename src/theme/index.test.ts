/**
 * No prueba diseño (eso no es testeable), prueba que la jerarquía
 * semántica de colores/tipografía no se rompa por accidente al tocar
 * theme/colors.ts o theme/typography.ts.
 */
import { colors, spacing, stockStatus, typography } from './index';

describe('stockStatus', () => {
  it('usa los colores semánticos de la paleta, no valores sueltos', () => {
    expect(stockStatus.ok).toBe(colors.success);
    expect(stockStatus.low).toBe(colors.warning);
    expect(stockStatus.critical).toBe(colors.danger);
    expect(stockStatus.expired).toBe(colors.danger);
  });

  it('"low" (stock bajo) no comparte color con "secondary" (badges de categoría)', () => {
    // Ver el comentario en theme/colors.ts: es intencional que no se
    // confundan visualmente una alerta con un badge decorativo.
    expect(stockStatus.low).not.toBe(colors.secondary);
  });
});

describe('spacing', () => {
  it('la escala es estrictamente creciente', () => {
    const valores = Object.values(spacing);
    const ordenados = [...valores].sort((a, b) => a - b);
    expect(valores).toEqual(ordenados);
  });
});

describe('typography', () => {
  it('cada estilo de texto define familia, tamaño e interlineado', () => {
    Object.values(typography).forEach((estilo) => {
      expect(estilo.fontFamily).toBeTruthy();
      expect(estilo.fontSize).toBeGreaterThan(0);
      expect(estilo.lineHeight).toBeGreaterThan(0);
    });
  });
});
