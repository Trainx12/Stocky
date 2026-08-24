import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { Logo } from '../components/Logo';
import { signInWithGoogle } from '../services/auth';
import { colors, spacing, typography } from '../theme';

/**
 * RF1. El botón ya dispara el flujo completo de OAuth con Google contra
 * Supabase Auth (services/auth.ts); lo único que falta para que funcione
 * de punta a punta es cargar el client id/secret de Google en el
 * dashboard de Supabase (Authentication > Providers > Google).
 */
export function LoginScreen() {
  const [loading, setLoading] = useState(false);

  async function handleGoogleLogin() {
    setLoading(true);
    try {
      await signInWithGoogle();
      // Si el login fue exitoso, AuthContext detecta la sesión nueva y
      // RootNavigator cambia automáticamente al stack principal.
    } catch (err) {
      Alert.alert('No se pudo iniciar sesión', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.center}>
        <Logo size={72} />
      </View>
      <View style={styles.bottom}>
        <Button label="Continuar con Google" onPress={handleGoogleLogin} loading={loading} />
        <Text style={styles.legal}>
          Al continuar aceptás que Stocky organice el inventario de tu hogar. Podés eliminar tu
          cuenta cuando quieras.
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottom: {
    gap: spacing.md,
  },
  legal: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
