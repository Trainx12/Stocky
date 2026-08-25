import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius, spacing, typography } from '../theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Botón base de la app. "primary" y "secondary" usan el degradé violeta y
 * naranja del logo respectivamente; "outline" es para acciones secundarias
 * sobre fondos ya cargados de color. Centralizarlo acá evita que cada
 * pantalla reimplemente su propio degradé/estado de loading.
 */
export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: ButtonProps) {
  // "outline" no lleva degradé, los otros dos sí (cada uno con su paleta).
  const isGradient = variant === 'primary' || variant === 'secondary';
  const colorsForGradient = variant === 'secondary' ? gradients.secondary : gradients.primary;

  // Contenido interno, igual para las tres variantes: texto o spinner
  // mientras `loading` esté activo.
  const content = (
    <View style={styles.content}>
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text
          style={[
            styles.label,
            variant === 'outline' && { color: colors.primary },
          ]}
        >
          {label}
        </Text>
      )}
    </View>
  );

  // Variantes con degradé: el <LinearGradient> pinta el fondo, el
  // TouchableOpacity de afuera es el que recibe el toque.
  if (isGradient) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onPress}
        disabled={disabled || loading}
        style={[styles.wrapper, (disabled || loading) && styles.disabled, style]}
      >
        <LinearGradient
          colors={colorsForGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  // Variante "outline": fondo liso con borde, sin degradé.
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrapper, styles.outline, (disabled || loading) && styles.disabled, style]}
    >
      {content}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gradient: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outline: {
    borderWidth: 1.5,
    borderColor: colors.primary,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.button,
    color: colors.white,
  },
  disabled: {
    opacity: 0.5,
  },
});
