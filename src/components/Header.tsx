import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Logo } from './Logo';
import { colors, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface HeaderProps {
  /** Nombre del usuario logueado; si es null/undefined se muestra un saludo genérico. */
  nombre?: string | null;
  /** Si viene, muestra el botón "?" (ayuda) al lado del logo. */
  onAyuda?: () => void;
}

/**
 * Header fijo de la pantalla principal (Home/Dashboard): saludo
 * personalizado a la izquierda + badge del logo a la derecha, en una fila.
 * Es un componente aparte (y no texto suelto en HomeScreen) porque el
 * mismo patrón "saludo + logo" se va a reusar en otras pantallas del stack
 * logueado a medida que se agreguen (hogar, perfil, etc.).
 */
export function Header({ nombre, onAyuda }: HeaderProps) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.row}>
      <View style={styles.textos}>
        {/* Saludo: usa el nombre si ya cargó el perfil, si no un genérico para no dejar el hueco vacío */}
        <Text style={styles.saludo}>¡Hola{nombre ? `, ${nombre}` : ''}!</Text>
        <Text style={styles.subtitulo}>Así está tu hogar hoy</Text>
      </View>
      <View style={styles.derecha}>
        {/* Ayuda: cómo hacer lo básico, paso a paso (AyudaScreen). */}
        {onAyuda && (
          <Pressable onPress={onAyuda} style={styles.ayuda} accessibilityRole="button" accessibilityLabel="Ayuda">
            <Ionicons name="help-circle-outline" size={30} color={colors.primary} />
          </Pressable>
        )}
        {/* Logo en modo compacto (solo el badge, sin wordmark) para no competir con el saludo */}
        <Logo size={48} compact />
      </View>
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  textos: {
    flexShrink: 1,
    gap: 2,
  },
  derecha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ayuda: {
    padding: 2,
  },
  saludo: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitulo: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
