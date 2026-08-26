import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from './Button';
import { crearHogar, unirseAHogar } from '../services/hogares';
import type { Hogar } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';

type Mode = 'crear' | 'unirse';

interface HogarFormModalProps {
  visible: boolean;
  mode: Mode;
  onClose: () => void;
  /** Se llama cuando la operación (crear o unirse) terminó bien. */
  onSuccess: (hogar: Hogar) => void;
}

const COPY: Record<Mode, { title: string; placeholder: string; buttonLabel: string; autoCapitalize: 'words' | 'characters' }> = {
  crear: {
    title: 'Crear Nuevo Hogar',
    placeholder: 'Ej: Casa de Julie',
    buttonLabel: 'Crear hogar',
    autoCapitalize: 'words',
  },
  unirse: {
    title: 'Unirme a un Hogar',
    placeholder: 'Código de invitación',
    buttonLabel: 'Unirme',
    autoCapitalize: 'characters',
  },
};

/**
 * Un solo modal reusado para "Crear Nuevo Hogar" y "Unirme a un Hogar":
 * ambos son "un input de texto + un botón que dispara una RPC", solo
 * cambia el copy y a cuál de las dos funciones de src/services/hogares.ts
 * le pasa el valor. Separar esto en dos componentes casi idénticos
 * hubiera duplicado el manejo de loading/error sin necesidad.
 */
export function HogarFormModal({ visible, mode, onClose, onSuccess }: HogarFormModalProps) {
  const [valor, setValor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  // Se limpia el estado interno al cerrar, para que la próxima vez que se
  // abra (crear o unirse de nuevo) no arrastre el texto/error anterior.
  function handleClose() {
    setValor('');
    setError(null);
    onClose();
  }

  async function handleSubmit() {
    if (!valor.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const hogar = mode === 'crear' ? await crearHogar(valor) : await unirseAHogar(valor);
      setValor('');
      onSuccess(hogar);
    } catch (err) {
      // Los mensajes de las excepciones `raise exception` del lado de
      // Postgres (nombre vacío, código inexistente) llegan legibles acá.
      setError(err instanceof Error ? err.message : 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>{copy.title}</Text>

          <TextInput
            style={styles.input}
            placeholder={copy.placeholder}
            placeholderTextColor={colors.textSecondary}
            value={valor}
            onChangeText={setValor}
            autoCapitalize={copy.autoCapitalize}
            autoCorrect={false}
            editable={!loading}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Button label={copy.buttonLabel} onPress={handleSubmit} loading={loading} disabled={!valor.trim()} />
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
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
