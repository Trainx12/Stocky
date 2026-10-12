import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { colors, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

// Dibujo de la casa del logo (assets/logo-casa.png), sin el texto "stocky":
// recortado del logo completo (assets/logo-stocky-completo.png). El texto
// va aparte, como <Text>, porque en el archivo original es negro y en modo
// oscuro no se vería; así toma el color del tema.
const CASA = require('../../assets/logo-casa.png');

interface LogoProps {
  size?: number;
  /**
   * Modo compacto: solo la casa, sin "Stocky" ni el lema debajo. Se usa en
   * el encabezado de las pantallas ya logueadas (poco espacio vertical), a
   * diferencia de Welcome/Login que muestran el logo completo.
   */
  compact?: boolean;
}

/**
 * Logo de Stocky (casa violeta y amarilla con canasta y check verde). Es un
 * componente aparte para que cualquier cambio de marca se haga en un solo
 * lugar.
 */
export function Logo({ size = 96, compact = false }: LogoProps) {
  const styles = useEstilos(crearEstilos);
  const casa = (
    <Image
      source={CASA}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Logo de Stocky"
    />
  );
  if (compact) return casa;

  return (
    <View style={styles.wrapper}>
      {casa}
      <Text style={styles.wordmark}>Stocky</Text>
      <Text style={styles.slogan}>Tu hogar, siempre organizado</Text>
    </View>
  );
}

/**
 * Nombre de un hogar con el logo adelante (antes era el emoji 🏠). Se usa en
 * "Tus hogares activos", solicitudes, invitaciones y "Cambiar hogar".
 */
export function NombreDeHogar({ nombre, style }: { nombre: string; style?: StyleProp<TextStyle> }) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.nombreHogar}>
      <Logo compact size={22} />
      <Text style={[style, styles.nombreHogarTexto]} numberOfLines={1}>
        {nombre}
      </Text>
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
  nombreHogar: {
    flexDirection: 'row',
    flexShrink: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  nombreHogarTexto: {
    flexShrink: 1,
  },
  wrapper: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  wordmark: {
    ...typography.h1,
    color: colors.primary,
    marginTop: spacing.sm,
  },
  slogan: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
