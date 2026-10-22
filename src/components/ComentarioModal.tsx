import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Constants from 'expo-constants';
import { Button } from './Button';
import { EvitarTeclado, useRellenoInferior } from './HojaConTeclado';
import { enviarComentario, ETIQUETA_TIPO_COMENTARIO, LARGO_MAXIMO_COMENTARIO, validarComentario } from '../services/comentarios';
import type { TipoComentario } from '../types/database';
import { avisar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface ComentarioModalProps {
  visible: boolean;
  onClose: () => void;
  usuarioId: string;
}

const TIPOS: TipoComentario[] = ['idea', 'problema', 'otro'];

/**
 * "Contanos qué mejorar" (Cuenta → Ajustes): idea, problema u otro + texto.
 * Lo leen los administradores en "Comentarios" (services/comentarios.ts).
 * Junto con el texto va la plataforma (android/ios/web) y la versión de la
 * app, nada más.
 */
export function ComentarioModal({ visible, onClose, usuarioId }: ComentarioModalProps) {
  const styles = useEstilos(crearEstilos);
  const rellenoInferior = useRellenoInferior(spacing.lg);
  const [tipo, setTipo] = useState<TipoComentario>('idea');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTipo('idea');
    setMensaje('');
  }, [visible]);

  async function handleEnviar() {
    const problema = validarComentario(mensaje);
    if (problema) {
      avisar('Falta algo', problema, 'info');
      return;
    }
    setEnviando(true);
    try {
      await enviarComentario(usuarioId, tipo, mensaje, {
        plataforma: Platform.OS,
        version: Constants.expoConfig?.version ?? '',
      });
      avisar('¡Gracias!', 'Recibimos tu comentario. Lo vamos a leer con atención.', 'exito');
      onClose();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo enviar el comentario.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <EvitarTeclado>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: rellenoInferior }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Contanos qué mejorar</Text>
          <Text style={styles.texto}>Una idea, algo que falló o lo que quieras. Lo lee el equipo de Stocky.</Text>

          <View style={styles.tipos}>
            {TIPOS.map((t) => (
              <Pressable
                key={t}
                onPress={() => setTipo(t)}
                style={[styles.chip, tipo === t && styles.chipActivo]}
                accessibilityRole="button"
                accessibilityState={{ selected: tipo === t }}
              >
                <Text style={[styles.chipTexto, tipo === t && styles.chipTextoActivo]}>{ETIQUETA_TIPO_COMENTARIO[t]}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            style={styles.input}
            value={mensaje}
            onChangeText={setMensaje}
            multiline
            maxLength={LARGO_MAXIMO_COMENTARIO}
            placeholder={tipo === 'problema' ? 'Qué estabas haciendo y qué pasó...' : 'Escribí acá...'}
            placeholderTextColor={colors.textSecondary}
            textAlignVertical="top"
            accessibilityLabel="Tu comentario"
          />
          <Text style={styles.contador}>
            {mensaje.length}/{LARGO_MAXIMO_COMENTARIO}
          </Text>

          <Button label="Enviar" onPress={handleEnviar} loading={enviando} disabled={!mensaje.trim()} />
          <Button label="Cancelar" variant="outline" onPress={onClose} disabled={enviando} />
        </Pressable>
      </Pressable>
      </EvitarTeclado>
    </Modal>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
    },
    texto: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    tipos: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActivo: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipTexto: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    chipTextoActivo: {
      color: colors.white,
    },
    input: {
      ...typography.body,
      color: colors.textPrimary,
      minHeight: 120,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      backgroundColor: colors.background,
    },
    contador: {
      ...typography.caption,
      color: colors.textSecondary,
      alignSelf: 'flex-end',
    },
  });
