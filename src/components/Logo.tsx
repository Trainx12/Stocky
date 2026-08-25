import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

/**
 * Placeholder de marca hasta que el archivo final del logo (casa
 * violeta/amarilla con canasta y check verde) se agregue a `assets/` y se
 * reemplace este componente por una <Image>. Se mantiene como componente
 * separado (no texto suelto en cada pantalla) para que ese reemplazo sea
 * un cambio en un solo lugar.
 */
export function Logo({ size = 96 }: { size?: number }) {
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
