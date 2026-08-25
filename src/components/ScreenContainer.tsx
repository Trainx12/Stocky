import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  style?: ViewStyle;
  /** Para pantallas de bienvenida/onboarding que quieren ir borde a borde. */
  noPadding?: boolean;
}

/** Envoltorio estándar de pantalla: safe area + fondo + padding consistente. */
export function ScreenContainer({ children, style, noPadding }: ScreenContainerProps) {
  return (
    // SafeAreaView evita que el contenido quede debajo del notch/barra de
    // estado o los botones del sistema.
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.content, !noPadding && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
});
