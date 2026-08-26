import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '../theme';

interface ManageHomesSheetProps {
  visible: boolean;
  onClose: () => void;
  onCrearHogar: () => void;
  onAdministrarHogares: () => void;
}

/**
 * Bottom sheet "Gestionar Mis Hogares", disparado con un long-press sobre
 * el ícono de Perfil de la BottomNavBar. Se implementa con el <Modal>
 * nativo de RN (transparent + animationType="slide") en vez de sumar una
 * librería de bottom sheets: solo necesitamos un panel simple con dos
 * opciones, no gestos de arrastre ni snap points.
 */
export function ManageHomesSheet({ visible, onClose, onCrearHogar, onAdministrarHogares }: ManageHomesSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop: ocupa toda la pantalla, cerrar el sheet al tocar afuera del panel */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Pressable interno sin onPress: evita que un toque DENTRO del
            panel se propague al backdrop y cierre el sheet por error */}
        <Pressable style={styles.sheet}>
          {/* Barra decorativa arriba del panel, indicador visual estándar de bottom sheet */}
          <View style={styles.handle} />

          <Text style={styles.title}>Gestionar Mis Hogares</Text>

          <SheetOption
            icon="add-circle-outline"
            label="Crear Nuevo Hogar"
            onPress={() => {
              onClose();
              onCrearHogar();
            }}
          />
          <SheetOption
            icon="home-outline"
            label="Administrar Mis Hogares"
            onPress={() => {
              onClose();
              onAdministrarHogares();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

interface SheetOptionProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

// Fila de opción dentro del sheet: ícono + label + chevron, todo tocable.
function SheetOption({ icon, label, onPress }: SheetOptionProps) {
  return (
    <Pressable style={styles.option} onPress={onPress}>
      <Ionicons name={icon} size={22} color={colors.primary} />
      <Text style={styles.optionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
    </Pressable>
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
    gap: spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  optionLabel: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flex: 1,
  },
});
