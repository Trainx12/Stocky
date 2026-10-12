import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  children: React.ReactNode;
}

interface Estado {
  error: Error | null;
}

/**
 * Red de seguridad ("error boundary" de React) alrededor de toda la app
 * (App.tsx). Si una pantalla falla al dibujarse, sin esto React deja la
 * pantalla vacía (gris en modo oscuro) y la única salida era cerrar y volver
 * a abrir la app (incidentes-sprint10.md #17). Con esto se muestra un aviso y
 * un botón "Reintentar" que vuelve a dibujar la app, y el error queda en la
 * consola para poder investigarlo.
 *
 * Es un componente de clase porque React solo permite atrapar errores de
 * dibujo así (no hay un hook equivalente). Lee los colores en cada render
 * (no usa useEstilos, que es un hook), así respeta el modo claro/oscuro.
 */
export class RedDeSeguridad extends React.Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Stocky] Error al dibujar una pantalla:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const styles = crearEstilos();
    return (
      <View style={styles.fondo}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.titulo}>Algo salió mal</Text>
        <Text style={styles.texto}>
          Esta pantalla tuvo un problema. Tocá "Reintentar"; si se repite, cerrá y volvé a abrir la app y contanos qué
          estabas haciendo.
        </Text>
        <Pressable onPress={() => this.setState({ error: null })} style={styles.boton} accessibilityRole="button">
          <Text style={styles.botonTexto}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

const crearEstilos = () =>
  StyleSheet.create({
    fondo: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      padding: spacing.xl,
      backgroundColor: colors.background,
    },
    titulo: {
      ...typography.h2,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    texto: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    boton: {
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.xl,
      paddingVertical: spacing.sm,
    },
    botonTexto: {
      ...typography.bodyMedium,
      color: colors.white,
    },
  });
