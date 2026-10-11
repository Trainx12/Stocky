import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import { signOut } from '../services/auth';
import { colors, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

/**
 * Lo único que ve una cuenta deshabilitada por un administrador (ver
 * services/usuarios.ts). RootNavigator la muestra en lugar del stack
 * principal apenas `usuario.habilitado` es false -- al loguearse o al
 * instante si la deshabilitan con la app abierta (Realtime en AuthContext).
 * No es la barrera de seguridad: la base ya le niega todos los datos (ver
 * migración 20261011120000_abm_usuarios_y_habilitado.sql); esta pantalla
 * solo explica qué pasa en vez de mostrar listas vacías o errores sueltos.
 */
export function CuentaDeshabilitadaScreen() {
  const styles = useEstilos(crearEstilos);
  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={colors.danger} />
        <Text style={styles.titulo}>Cuenta deshabilitada</Text>
        <Text style={styles.texto}>
          Un administrador deshabilitó tu cuenta, así que por ahora no podés usar Stocky. Si creés que es un
          error, contactá a un administrador.
        </Text>
      </View>
      <Button label="Cerrar sesión" variant="outline" onPress={() => signOut()} />
    </ScreenContainer>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
  container: {
    justifyContent: 'space-between',
    paddingVertical: spacing.xxl,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
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
});
