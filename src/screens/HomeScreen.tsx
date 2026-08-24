import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../services/auth';
import { colors, spacing, typography } from '../theme';

/**
 * Placeholder mínimo del stack "logueado", solo para cerrar el círculo de
 * auth de punta a punta. El dashboard real (resumen de hogar, productos
 * próximos a vencer, etc.) es RF5/RF7 y llega en sprint 2 y 3.
 */
export function HomeScreen() {
  const { usuario, usuarioLoading, refreshUsuario } = useAuth();

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.center}>
        {usuarioLoading && !usuario ? (
          <ActivityIndicator color={colors.primary} />
        ) : usuario ? (
          <>
            <Text style={styles.titulo}>¡Hola{usuario.nombre ? `, ${usuario.nombre}` : ''}!</Text>
            <Text style={styles.subtitulo}>
              Rol: {usuario.rol}
              {'\n'}Todavía no tenés un hogar creado (llega en el próximo sprint).
            </Text>
          </>
        ) : (
          // No confundir con "rol: usuario": acá no sabemos el rol
          // todavía, puede ser un error de red o de RLS, no un default.
          <>
            <Text style={styles.subtitulo}>
              No se pudo cargar tu perfil. Revisá tu conexión e intentá de nuevo.
            </Text>
            <Button label="Reintentar" variant="outline" onPress={() => refreshUsuario()} />
          </>
        )}
      </View>
      <Button label="Cerrar sesión" variant="outline" onPress={() => signOut()} />
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
    gap: spacing.sm,
  },
  titulo: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitulo: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
