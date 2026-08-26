import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface LogoProps {
  size?: number;
  /**
   * Modo compacto: solo el badge de casa, sin wordmark ni slogan debajo.
   * Se usa en headers de pantallas ya logueadas (poco espacio vertical),
   * a diferencia de Welcome/Onboarding que sí quieren el logo completo.
   */
  compact?: boolean;
}

/**
 * Placeholder de marca hasta que el archivo final del logo (casa
 * violeta/amarilla con canasta y check verde) se agregue a `assets/` y se
 * reemplace este componente por una <Image>. Se mantiene como componente
 * separado (no texto suelto en cada pantalla) para que ese reemplazo sea
 * un cambio en un solo lugar.
 */
export function Logo({ size = 96, compact = false }: LogoProps) {
  // Modo compacto (header): solo el badge, nada de texto debajo.
  if (compact) {
    return (
      <View style={[styles.badge, { width: size, height: size, borderRadius: size / 3 }]}>
        <Text style={{ fontSize: size * 0.5 }}>🏠</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      {/* Badge con emoji de casa: reemplazar por <Image> cuando esté el logo real */}
      <View style={[styles.badge, { width: size, height: size, borderRadius: size / 3 }]}>
        <Text style={{ fontSize: size * 0.5 }}>🏠</Text>
      </View>
      <Text style={styles.wordmark}>Stocky</Text>
      <Text style={styles.slogan}>tu hogar, siempre organizado</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  badge: {
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
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
