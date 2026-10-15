import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { colors, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface HeaderProps {
  /** Nombre del usuario logueado; si es null/undefined se muestra un saludo genérico. */
  nombre?: string | null;
  /** Email y foto de perfil del usuario, para el círculo al lado del saludo. */
  email?: string | null;
  avatarUrl?: string | null;
  /** Si viene, tocar la foto lleva a Cuenta (donde se cambia). */
  onPerfil?: () => void;
  /** Si viene, muestra el botón "?" (ayuda) al lado del logo. */
  onAyuda?: () => void;
  /** Para que el tutorial guiado pueda señalar el botón "?". */
  refAyuda?: React.Ref<View>;
}

/**
 * Header fijo de la pantalla principal (Home/Dashboard): foto de perfil y
 * saludo personalizado a la izquierda + badge del logo a la derecha, en una fila.
 * Es un componente aparte (y no texto suelto en HomeScreen) porque el
 * mismo patrón "saludo + logo" se va a reusar en otras pantallas del stack
 * logueado a medida que se agreguen (hogar, perfil, etc.).
 */
export function Header({ nombre, email, avatarUrl, onPerfil, onAyuda, refAyuda }: HeaderProps) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.row}>
      <View style={styles.izquierda}>
        <Pressable
          onPress={onPerfil}
          disabled={!onPerfil}
          accessibilityRole={onPerfil ? 'button' : 'image'}
          accessibilityLabel={onPerfil ? 'Tu cuenta' : 'Tu foto de perfil'}
        >
          <Avatar url={avatarUrl} nombre={nombre} email={email} tamano={48} variante="fuerte" />
        </Pressable>
        <View style={styles.textos}>
          {/* Saludo: usa el nombre si ya cargó el perfil, si no un genérico para no dejar el hueco vacío */}
          <Text style={styles.saludo}>¡Hola{nombre ? `, ${nombre}` : ''}!</Text>
          <Text style={styles.subtitulo}>Así está tu hogar hoy</Text>
        </View>
      </View>
      <View style={styles.derecha}>
        {/* Ayuda: cómo hacer lo básico, paso a paso (AyudaScreen). */}
        {onAyuda && (
          <View ref={refAyuda} collapsable={false}>
            <Pressable onPress={onAyuda} style={styles.ayuda} accessibilityRole="button" accessibilityLabel="Ayuda">
              <Ionicons name="help-circle-outline" size={30} color={colors.primary} />
            </Pressable>
          </View>
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
  izquierda: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flexShrink: 1,
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
