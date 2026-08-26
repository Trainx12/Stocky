import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface SectionCardProps {
  title: string;
  children: React.ReactNode;
}

/**
 * Envoltorio común para cada bloque de contenido del Home ("Tus hogares
 * activos", "Actividad reciente", "Accesos rápidos"): título + tarjeta con
 * fondo. Se centraliza acá para que las tres secciones tengan el mismo
 * espaciado/tipografía y no haya que repetir el StyleSheet tres veces.
 */
export function SectionCard({ title, children }: SectionCardProps) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
});
