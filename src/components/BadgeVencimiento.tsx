import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { EstadoVencimiento } from '../services/productos';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

/**
 * Cartelito de vencimiento con los colores de un semáforo, para que se lea
 * de un vistazo (antes "por vencer" y "vencido" eran del mismo rojo y
 * parecía que todo estaba vencido):
 *   - verde: le falta (más que los días de aviso);
 *   - amarillo: está por vencer;
 *   - rojo: ya venció.
 * Lleva además un ícono distinto en cada caso, para quien no distingue bien
 * los colores. Se usa en el inicio ("Productos próximos a vencer") y en la
 * lista de productos.
 */
export function BadgeVencimiento({
  estado,
  etiqueta,
  style,
}: {
  estado: EstadoVencimiento;
  etiqueta: string;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useEstilos(crearEstilos);
  const { fondo, texto, icono } = {
    ok: { fondo: styles.ok, texto: colors.white, icono: 'checkmark-circle' as const },
    proximo: { fondo: styles.proximo, texto: colors.black, icono: 'time' as const },
    vencido: { fondo: styles.vencido, texto: colors.white, icono: 'warning' as const },
  }[estado];
  return (
    <View style={[styles.badge, fondo, style]}>
      <Ionicons name={icono} size={11} color={texto} />
      <Text style={[styles.texto, { color: texto }]} numberOfLines={1}>
        {etiqueta}
      </Text>
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: radius.pill,
    },
    ok: {
      backgroundColor: colors.success,
    },
    // Amarillo con letra oscura: con letra blanca no se lee.
    proximo: {
      backgroundColor: colors.warning,
    },
    vencido: {
      backgroundColor: colors.danger,
    },
    texto: {
      ...typography.caption,
      fontSize: 11,
      lineHeight: 14,
    },
  });
