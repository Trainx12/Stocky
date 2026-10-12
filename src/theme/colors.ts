/**
 * Paleta de Stocky, derivada del logo (casa violeta/amarilla, canasta,
 * check verde). Cada color tiene un rol semántico fijo: no se reutiliza
 * "primary" para alertas ni "danger" para acentos decorativos, de forma
 * que el significado de un color sea consistente en toda la app.
 *
 * Modo oscuro (Sprint 10): hay dos juegos de valores (claro y oscuro) con
 * los MISMOS nombres. `colors` es el objeto que usan todas las pantallas;
 * `aplicarEsquema()` le cambia los valores en el lugar al pasar de un modo
 * al otro, y los estilos se recalculan con `useEstilos` (ver
 * src/theme/useEstilos.ts y context/TemaContext.tsx). Por eso ningún
 * componente debería guardarse un color en una constante de módulo: se
 * quedaría con el del modo en que arrancó la app.
 */

export type EsquemaColor = 'claro' | 'oscuro';

export const palette = {
  // Violeta del techo / canasta -> acciones principales, header, FAB.
  primary: '#7B2FF7',
  primaryDark: '#5B1FBF',
  primaryLight: '#EDE0FE',

  // Amarillo/naranja de la casa -> tarjetas destacadas, badges de categoría.
  secondary: '#FFA726',
  secondaryDark: '#FF9800',
  secondaryLight: '#FFF3E0',

  // Verde del check -> estados positivos (stock ok, no vencido, confirmado).
  success: '#4CAF50',
  successLight: '#E8F5E9',

  // Rosa/coral de la chimenea -> vencimientos próximos, stock crítico.
  danger: '#F4436C',
  dangerLight: '#FDE7EC',

  // Amarillo ámbar, deliberadamente distinto del "secondary" naranja para
  // que un badge de categoría nunca se confunda con una alerta de stock bajo.
  warning: '#FFC107',
  warningLight: '#FFF8E1',

  white: '#FFFFFF',
  black: '#1B1B1F',
};

// Grises/blancos para fondos, bordes y texto — no forman parte de la
// identidad de marca, se usan en casi todas las pantallas.
export const neutral = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#ECECEF',
  textPrimary: '#1B1B1F',
  textSecondary: '#6B6B75',
  textDisabled: '#B0B0B8',
};

// Los mismos roles en modo oscuro. El violeta se aclara un poco para que
// tenga contraste sobre fondo oscuro; los "Light" (fondos de chips, badges y
// tarjetas destacadas) pasan a tonos oscuros del mismo color, y
// "primaryDark" (que se usa como TEXTO sobre primaryLight) pasa a ser claro.
// `white` se mantiene blanco: se usa como texto sobre botones de color.
export const paletteOscura: typeof palette = {
  primary: '#9D6BFF',
  primaryDark: '#D4C1FF',
  primaryLight: '#2C2342',
  secondary: '#FFB74D',
  secondaryDark: '#FFA726',
  secondaryLight: '#3A2C17',
  success: '#66BB6A',
  successLight: '#1C2E1D',
  danger: '#FF6B8B',
  dangerLight: '#3D1C25',
  warning: '#FFCA28',
  warningLight: '#3A3214',
  white: '#FFFFFF',
  black: '#1B1B1F',
};

export const neutralOscuro: typeof neutral = {
  background: '#121216',
  surface: '#1E1E24',
  border: '#33333D',
  textPrimary: '#F2F2F5',
  textSecondary: '#A6A6B0',
  textDisabled: '#5C5C66',
};

/**
 * Jerarquía de estatus de stock, usada en badges, barras de progreso y
 * chips de vencimiento. Mantener este objeto como única fuente de verdad
 * evita que cada pantalla reinvente sus propios umbrales de color.
 */
function stockStatusDe(p: typeof palette) {
  return {
    ok: p.success,
    low: p.warning,
    critical: p.danger,
    expired: p.danger,
  };
}

export const stockStatus = stockStatusDe(palette);

// Pares de colores para <LinearGradient>, usados en Button.tsx (variantes
// "primary" y "secondary").
export const gradients: { primary: [string, string]; secondary: [string, string] } = {
  primary: [palette.primary, palette.primaryDark],
  secondary: [palette.secondary, palette.secondaryDark],
};

// Todo junto en un solo objeto, para poder importar `colors.primary`,
// `colors.background`, `colors.stockStatus.ok`, etc. desde un solo lugar.
// Sus valores cambian con aplicarEsquema().
export const colors = {
  ...palette,
  ...neutral,
  stockStatus,
};

export type Colors = typeof colors;

// Los valores de cada esquema, sin tocar nada (lógica pura, testeable).
export function coloresDe(esquema: EsquemaColor): Omit<Colors, 'stockStatus'> & { stockStatus: ReturnType<typeof stockStatusDe> } {
  const p = esquema === 'oscuro' ? paletteOscura : palette;
  const n = esquema === 'oscuro' ? neutralOscuro : neutral;
  return { ...p, ...n, stockStatus: stockStatusDe(p) };
}

// Pasa toda la app a un esquema: cambia en el lugar los valores de `colors`
// (y de stockStatus/gradients), así las pantallas que leen `colors.x` en su
// próximo render ya ven el modo nuevo. Lo llama TemaProvider.
export function aplicarEsquema(esquema: EsquemaColor): void {
  const nuevos = coloresDe(esquema);
  const { stockStatus: nuevoStock, ...resto } = nuevos;
  Object.assign(colors, resto);
  Object.assign(stockStatus, nuevoStock);
  gradients.primary = [nuevos.primary, esquema === 'oscuro' ? '#7B2FF7' : nuevos.primaryDark];
  gradients.secondary = [nuevos.secondary, nuevos.secondaryDark];
}
