/**
 * Baloo 2 (redondeada, gruesa) se usa para títulos y elementos con
 * personalidad ("hogar organizado y amigable"); Poppins para texto de
 * lectura, donde Baloo se volvería pesada. Los nombres de familia deben
 * coincidir con las claves que se cargan con useFonts en App.tsx.
 */
export const fontFamily = {
  headingRegular: 'Baloo2_500Medium',
  headingBold: 'Baloo2_700Bold',
  bodyRegular: 'Poppins_400Regular',
  bodyMedium: 'Poppins_500Medium',
  bodySemiBold: 'Poppins_600SemiBold',
  bodyBold: 'Poppins_700Bold',
} as const;

// Escala de tamaños de fuente en px, de más chico a más grande.
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;

// Estilos de texto ya combinados (fuente + tamaño + interlineado), listos
// para pisar directo en un StyleSheet: `...typography.h1`.
export const typography = {
  h1: { fontFamily: fontFamily.headingBold, fontSize: fontSize.display, lineHeight: 40 },
  h2: { fontFamily: fontFamily.headingBold, fontSize: fontSize.xxl, lineHeight: 34 },
  h3: { fontFamily: fontFamily.headingBold, fontSize: fontSize.xl, lineHeight: 28 },
  body: { fontFamily: fontFamily.bodyRegular, fontSize: fontSize.md, lineHeight: 22 },
  bodyMedium: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.md, lineHeight: 22 },
  caption: { fontFamily: fontFamily.bodyRegular, fontSize: fontSize.sm, lineHeight: 18 },
  button: { fontFamily: fontFamily.bodySemiBold, fontSize: fontSize.md, lineHeight: 20 },
} as const;

export type Typography = typeof typography;
