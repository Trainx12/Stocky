/**
 * Paleta de Stocky, derivada del logo (casa violeta/amarilla, canasta,
 * check verde). Cada color tiene un rol semántico fijo: no se reutiliza
 * "primary" para alertas ni "danger" para acentos decorativos, de forma
 * que el significado de un color sea consistente en toda la app.
 */

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
} as const;

export const neutral = {
  background: '#FAFAFA',
  surface: '#FFFFFF',
  border: '#ECECEF',
  textPrimary: '#1B1B1F',
  textSecondary: '#6B6B75',
  textDisabled: '#B0B0B8',
} as const;

/**
 * Jerarquía de estatus de stock, usada en badges, barras de progreso y
 * chips de vencimiento. Mantener este objeto como única fuente de verdad
 * evita que cada pantalla reinvente sus propios umbrales de color.
 */
export const stockStatus = {
  ok: palette.success,
  low: palette.warning,
  critical: palette.danger,
  expired: palette.danger,
} as const;

export const gradients = {
  primary: [palette.primary, palette.primaryDark] as const,
  secondary: [palette.secondary, palette.secondaryDark] as const,
};

export const colors = {
  ...palette,
  ...neutral,
  stockStatus,
};

export type Colors = typeof colors;
