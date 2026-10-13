import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { iconoDeAccion, listarRegistro } from '../services/admin';
import { tiempoRelativo } from '../services/notificaciones';
import type { AccionAdmin } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminRegistro'>;

/**
 * Admin: registro de acciones de los administradores (tabla
 * admin_registro). Lo escriben triggers de la base cada vez que un admin
 * cambia un rol, habilita o deshabilita a alguien, o toca el catálogo
 * (aprobar/rechazar sugerencias, agregar, corregir o sacar productos).
 * Nadie lo puede editar ni borrar desde la app.
 */
export function AdminRegistroScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const [registro, setRegistro] = useState<AccionAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRegistro(await listarRegistro());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar el registro.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Registro de acciones</Text>
        <Pressable onPress={cargar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Recargar">
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : registro.length === 0 ? (
        <Text style={styles.vacio}>Todavía no hay acciones registradas.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {registro.map((a) => (
            <View key={a.id} style={styles.fila}>
              <Ionicons name={iconoDeAccion(a.accion) as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
              <View style={styles.filaTextos}>
                <Text style={styles.detalle}>{a.detalle}</Text>
                <Text style={styles.meta}>
                  {a.admin_email ?? 'Cuenta borrada'} · {tiempoRelativo(a.created_at)}
                </Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    title: {
      ...typography.h2,
      color: colors.textPrimary,
      flex: 1,
    },
    loader: {
      marginTop: spacing.xl,
    },
    error: {
      ...typography.body,
      color: colors.danger,
      textAlign: 'center',
    },
    vacio: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    lista: {
      gap: spacing.xs,
      paddingBottom: spacing.xl,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filaTextos: {
      flex: 1,
      gap: 2,
    },
    detalle: {
      ...typography.body,
      color: colors.textPrimary,
    },
    meta: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
