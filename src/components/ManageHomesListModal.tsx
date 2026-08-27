import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { HogarFormModal } from './HogarFormModal';
import { listarMisHogares, salirDeHogar } from '../services/hogares';
import type { Hogar } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';

interface ManageHomesListModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama después de crear/unirse/salir, para que HomeScreen refresque su propia vista de hogares. */
  onChanged: () => void;
}

/**
 * Pantalla de "Administrar Mis Hogares": lista los hogares del usuario
 * (puede ser más de uno) con opción de salir de cada uno, y desde acá
 * también se puede sumar a otro hogar por código (la otra mitad de
 * "gestionar", además de crear uno nuevo).
 */
export function ManageHomesListModal({ visible, onClose, onChanged }: ManageHomesListModalProps) {
  const [hogares, setHogares] = useState<Hogar[]>([]);
  const [loading, setLoading] = useState(false);
  const [joinModalVisible, setJoinModalVisible] = useState(false);
  // Hogar que se está editando (null = modal de editar cerrado). Guardar el
  // hogar completo, no solo su id, es lo que le permite a HogarFormModal
  // precargar el nombre actual en el input.
  const [hogarEditando, setHogarEditando] = useState<Hogar | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setHogares(await listarMisHogares());
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'No se pudieron cargar tus hogares.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Recarga la lista cada vez que se abre el modal (no solo al montar),
  // así refleja cambios hechos desde otro lado mientras estaba cerrado.
  useEffect(() => {
    if (visible) cargar();
  }, [visible, cargar]);

  function handleSalir(hogar: Hogar) {
    Alert.alert('Salir del hogar', `¿Seguro que querés salir de "${hogar.nombre}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          try {
            await salirDeHogar(hogar.id);
            await cargar();
            onChanged();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'No se pudo salir del hogar.');
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Mis Hogares</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : hogares.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no formás parte de ningún hogar.</Text>
          ) : (
            <View style={styles.list}>
              {hogares.map((hogar) => (
                <View key={hogar.id} style={styles.row}>
                  <View style={styles.rowTextos}>
                    <Text style={styles.rowNombre}>{hogar.nombre}</Text>
                    <Text style={styles.rowCodigo}>Código: {hogar.codigo_invitacion}</Text>
                  </View>
                  <View style={styles.rowActions}>
                    <Pressable
                      onPress={() => setHogarEditando(hogar)}
                      style={styles.accionButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Editar ${hogar.nombre}`}
                    >
                      <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
                    </Pressable>
                    <Pressable
                      onPress={() => handleSalir(hogar)}
                      style={styles.accionButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Salir de ${hogar.nombre}`}
                    >
                      <Ionicons name="exit-outline" size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Button label="Unirme a un hogar" variant="outline" onPress={() => setJoinModalVisible(true)} />
        </Pressable>
      </Pressable>

      <HogarFormModal
        visible={joinModalVisible}
        mode="unirse"
        onClose={() => setJoinModalVisible(false)}
        onSuccess={async () => {
          setJoinModalVisible(false);
          await cargar();
          onChanged();
        }}
      />

      <HogarFormModal
        visible={hogarEditando !== null}
        mode="editar"
        hogar={hogarEditando}
        onClose={() => setHogarEditando(null)}
        onSuccess={async () => {
          setHogarEditando(null);
          await cargar();
          onChanged();
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(27, 27, 31, 0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.md,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  loader: {
    marginVertical: spacing.lg,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTextos: {
    flexShrink: 1,
    gap: 2,
  },
  rowNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  rowCodigo: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  accionButton: {
    padding: spacing.xs,
  },
});
