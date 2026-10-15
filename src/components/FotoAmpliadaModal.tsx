import React from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface FotoAmpliadaModalProps {
  /** Foto a mostrar; null = cerrado. */
  imagen: ImageSourcePropType | null;
  /** Nombre del producto, debajo de la foto. */
  titulo?: string;
  onClose: () => void;
}

/**
 * Foto de un producto en grande, para verlo bien (en las miniaturas del
 * catálogo apenas se distingue). Se abre solo al tocar la foto; tocar en
 * cualquier lado la cierra.
 */
export function FotoAmpliadaModal({ imagen, titulo, onClose }: FotoAmpliadaModalProps) {
  const styles = useEstilos(crearEstilos);
  return (
    <Modal visible={imagen !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar la foto">
        <View style={styles.marco}>
          {imagen && <Image source={imagen} style={styles.foto} resizeMode="contain" />}
        </View>
        {!!titulo && <Text style={styles.titulo}>{titulo}</Text>}
        <View style={styles.cerrar}>
          <Ionicons name="close" size={20} color={colors.white} />
          <Text style={styles.cerrarTexto}>Tocá para cerrar</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.8)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
      gap: spacing.md,
    },
    // Fondo blanco: las fotos del catálogo son productos recortados sobre blanco.
    marco: {
      width: '100%',
      maxWidth: 420,
      aspectRatio: 1,
      borderRadius: radius.lg,
      backgroundColor: colors.white,
      overflow: 'hidden',
      padding: spacing.md,
    },
    foto: {
      width: '100%',
      height: '100%',
    },
    titulo: {
      ...typography.h3,
      color: colors.white,
      textAlign: 'center',
    },
    cerrar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    cerrarTexto: {
      ...typography.caption,
      color: colors.white,
    },
  });
