import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface BienvenidaTutorialModalProps {
  visible: boolean;
  nombre?: string | null;
  /** "Sí, mostrame": arranca el tutorial guiado. */
  onQuiero: () => void;
  /** "Ya sé usarla": no se vuelve a preguntar. */
  onYaSe: () => void;
}

/**
 * Pregunta que se hace la primera vez que una cuenta entra al inicio (en
 * ese dispositivo): si quiere el tutorial guiado o si ya sabe usar Stocky.
 * Ver src/tutorial/tutorial.ts y services/tutorial.ts.
 */
export function BienvenidaTutorialModal({ visible, nombre, onQuiero, onYaSe }: BienvenidaTutorialModalProps) {
  const styles = useEstilos(crearEstilos);
  const primerNombre = nombre?.trim().split(/\s+/)[0];

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onYaSe}>
      <View style={styles.fondo}>
        <View style={styles.tarjeta}>
          <View style={styles.icono}>
            <Ionicons name="sparkles" size={30} color={colors.primary} />
          </View>
          <Text style={styles.titulo}>{primerNombre ? `¡Hola, ${primerNombre}!` : '¡Hola!'}</Text>
          <Text style={styles.texto}>
            ¿Es tu primera vez en Stocky? Te mostramos paso a paso cómo cargar productos, escanear tickets, usar la voz y
            enterarte de lo que vence. Dura un minuto y lo podés cortar cuando quieras.
          </Text>
          <Button label="Sí, mostrame cómo se usa" onPress={onQuiero} style={styles.boton} />
          <Button label="Ya sé usarla" variant="outline" onPress={onYaSe} style={styles.boton} />
          <Text style={styles.nota}>Podés ver el tutorial cuando quieras desde Cuenta o desde la Ayuda (?).</Text>
        </View>
      </View>
    </Modal>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    fondo: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.md,
      backgroundColor: 'rgba(10, 6, 20, 0.72)',
    },
    tarjeta: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
      alignItems: 'center',
    },
    icono: {
      width: 60,
      height: 60,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryLight,
      marginBottom: spacing.xs,
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
      marginBottom: spacing.sm,
    },
    boton: {
      alignSelf: 'stretch',
    },
    nota: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xs,
    },
  });
