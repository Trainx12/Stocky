/** Escala de espaciado en base 4, para no repetir "magic numbers" en cada estilo. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/** Radios de borde consistentes con la estética redondeada del logo/tipografía. */
export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export type Spacing = typeof spacing;
