import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { HogarConRol } from '../services/hogares';
import { colors, radius, spacing, typography } from '../theme';

interface SeleccionarHogarModalProps {
  visible: boolean;
  onClose: () => void;
  hogares: HogarConRol[];
  hogarSeleccionadoId: string | null;
  onSeleccionar: (hogarId: string) => void;
}

/**
 * Sheet "Cambiar hogar": elegir a cuál de "Tus hogares activos" se refiere
 * el resto del dashboard (Actividad reciente, Accesos rápidos). Es una
 * selección puramente local a HomeScreen (no toca `usuarios.hogar_id`, que
 * sigue siendo el "hogar activo" real usado por el resto de la app/RLS) --
 * distinto de "Tus hogares activos", que sigue listando y administrando
 * TODOS los hogares sin importar cuál esté seleccionado acá.
 */
export function SeleccionarHogarModal({ visible, onClose, hogares, hogarSeleccionadoId, onSeleccionar }: SeleccionarHogarModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Cambiar hogar</Text>

          <View style={styles.list}>
            {hogares.map((hogar) => {
              const seleccionado = hogar.id === hogarSeleccionadoId;
              return (
                <Pressable
                  key={hogar.id}
                  style={styles.opcion}
                  onPress={() => {
                    onSeleccionar(hogar.id);
                    onClose();
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver el dashboard de ${hogar.nombre}`}
                >
                  <Text style={styles.opcionNombre} numberOfLines={1}>
                    🏠 {hogar.nombre}
                  </Text>
                  {seleccionado && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
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
  list: {
    gap: spacing.xs,
  },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  opcionNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
});
