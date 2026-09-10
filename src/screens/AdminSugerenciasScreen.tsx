import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { listarSugerenciasPendientes, responderSugerencia } from '../services/catalogo';
import type { ProductoCatalogo } from '../types/database';
import { avisar, confirmar } from '../lib/alert';
import { colors, spacing, typography } from '../theme';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminSugerencias'>;

/**
 * Pantalla de admin: sugerencias de productos nuevos para el catálogo
 * global (ver services/catalogo.ts), pendientes de aprobar o rechazar.
 * Primera pantalla de la app con acceso restringido por rol (RF9 en
 * general sigue pospuesta al Sprint 9 -- ver
 * docs/arquitectura-del-codigo.md -- esta es la excepción puntual que
 * pidió el equipo junto con el catálogo). El gateo real (que un usuario
 * común no pueda entrar) lo hace HomeScreen, que solo muestra el acceso a
 * esta pantalla si `usuario.rol === 'administrador'` -- la RLS del lado
 * del servidor es la que de verdad importa (un usuario común que fuerce
 * la navegación igual no vería ninguna fila 'pendiente' ajena, por la
 * policy de SELECT de productos_catalogo).
 */
export function AdminSugerenciasScreen({ navigation }: Props) {
  const [sugerencias, setSugerencias] = useState<ProductoCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  // ids con una respuesta en vuelo, para deshabilitar sus botones y no
  // disparar dos veces la misma aprobación/rechazo con un doble toque.
  const [respondiendoIds, setRespondiendoIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setSugerencias(await listarSugerenciasPendientes());
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar las sugerencias.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleResponder(sugerencia: ProductoCatalogo, aprobar: boolean) {
    if (!aprobar) {
      const confirmado = await confirmar(
        'Rechazar sugerencia',
        `¿Seguro que querés rechazar "${sugerencia.nombre}"? No queda ningún registro, quien la sugirió puede volver a mandarla.`,
        'Rechazar',
      );
      if (!confirmado) return;
    }

    setRespondiendoIds((actuales) => new Set(actuales).add(sugerencia.id));
    try {
      await responderSugerencia(sugerencia.id, aprobar);
      setSugerencias((actuales) => actuales.filter((s) => s.id !== sugerencia.id));
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo responder la sugerencia.');
    } finally {
      setRespondiendoIds((actuales) => {
        const siguientes = new Set(actuales);
        siguientes.delete(sugerencia.id);
        return siguientes;
      });
    }
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Sugerencias de productos</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : sugerencias.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="checkmark-circle-outline" size={32} color={colors.textSecondary} />
          <Text style={styles.emptyText}>No hay sugerencias pendientes.</Text>
        </View>
      ) : (
        <ScrollView style={styles.lista} showsVerticalScrollIndicator={false}>
          {sugerencias.map((sugerencia) => {
            const respondiendo = respondiendoIds.has(sugerencia.id);
            return (
              <View key={sugerencia.id} style={styles.fila}>
                <View style={styles.filaTextos}>
                  <Text style={styles.filaNombre} numberOfLines={1}>
                    {sugerencia.nombre}
                  </Text>
                  <Text style={styles.filaDetalle}>
                    {sugerencia.categoria} · {sugerencia.unidad}
                  </Text>
                </View>
                <View style={styles.filaAcciones}>
                  <Pressable
                    onPress={() => handleResponder(sugerencia, true)}
                    style={styles.accionButton}
                    disabled={respondiendo}
                    accessibilityRole="button"
                    accessibilityLabel={`Aprobar ${sugerencia.nombre}`}
                  >
                    <Ionicons name="checkmark-circle-outline" size={24} color={colors.primary} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleResponder(sugerencia, false)}
                    style={styles.accionButton}
                    disabled={respondiendo}
                    accessibilityRole="button"
                    accessibilityLabel={`Rechazar ${sugerencia.nombre}`}
                  >
                    <Ionicons name="close-circle-outline" size={24} color={colors.danger} />
                  </Pressable>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
    flexShrink: 1,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lista: {
    flex: 1,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filaTextos: {
    flexShrink: 1,
    gap: 2,
  },
  filaNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  filaDetalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filaAcciones: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  accionButton: {
    padding: spacing.xs,
  },
});
