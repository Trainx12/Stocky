import { colors, gradients, palette, neutral, stockStatus } from './colors';
import { typography, fontFamily, fontSize } from './typography';
import { spacing, radius } from './spacing';

/**
 * Punto único de entrada al sistema de diseño. Cualquier componente que
 * necesite un color, tipografía o espaciado debe importar `theme` desde
 * acá en vez de hardcodear valores, para que un cambio de paleta (por
 * ejemplo, ajustar el violeta primario) se propague solo.
 */
export const theme = {
  colors,
  gradients,
  typography,
  spacing,
  radius,
};

export type Theme = typeof theme;

export { colors, gradients, palette, neutral, stockStatus, typography, fontFamily, fontSize, spacing, radius };
