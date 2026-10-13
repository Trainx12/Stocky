import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { sugerirRecetas } from '../services/externalApis';
import type { IngredienteParaRecetas, RecetaSugerida } from '../services/externalApis';
import { recetasValidas } from '../services/recetas';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface RecetasModalProps {
  visible: boolean;
  onClose: () => void;
  /** Lo que está por vencer (ver ingredientesParaRecetas). */
  ingredientes: IngredienteParaRecetas[];
}

/**
 * "¿Qué cocino con esto?": pide a la función `recetas` (Gemini) 2 o 3
 * recetas simples con lo que está por vencer y las muestra plegadas; al
 * tocar una se ven los pasos. "Otras ideas" vuelve a pedir.
 */
export function RecetasModal({ visible, onClose, ingredientes }: RecetasModalProps) {
  const styles = useEstilos(crearEstilos);
  const [recetas, setRecetas] = useState<RecetaSugerida[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<number | null>(0);

  const pedir = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const resultado = recetasValidas(await sugerirRecetas(ingredientes));
      setRecetas(resultado);
      setAbierta(0);
      if (resultado.length === 0) setError('No se nos ocurrió nada con estos productos. Probá de nuevo.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos pensar recetas en este momento.');
    } finally {
      setCargando(false);
    }
  }, [ingredientes]);

  useEffect(() => {
    if (!visible) return;
    setRecetas([]);
    pedir();
    // Solo al abrir (no al cambiar `pedir`): si cambian los ingredientes con
    // el modal abierto, se vuelve a pedir con "Otras ideas".
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.encabezado}>
            <Text style={styles.title}>¿Qué cocino con esto?</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar">
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Text style={styles.subtitulo} numberOfLines={2}>
            Con lo que vence pronto: {ingredientes.map((i) => i.nombre).join(', ')}
          </Text>

          <ScrollView contentContainerStyle={styles.contenido}>
            {cargando ? (
              <View style={styles.centro}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.texto}>Pensando recetas...</Text>
              </View>
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : (
              recetas.map((receta, i) => {
                const estaAbierta = abierta === i;
                return (
                  <View key={`${receta.titulo}-${i}`} style={styles.receta}>
                    <Pressable
                      onPress={() => setAbierta(estaAbierta ? null : i)}
                      style={styles.recetaEncabezado}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: estaAbierta }}
                    >
                      <View style={styles.recetaTextos}>
                        <Text style={styles.recetaTitulo}>{receta.titulo}</Text>
                        <Text style={styles.recetaDetalle}>
                          {receta.minutos ? `${receta.minutos} min · ` : ''}Usa: {receta.usa.join(', ')}
                        </Text>
                      </View>
                      <Ionicons name={estaAbierta ? 'chevron-up' : 'chevron-down'} size={20} color={colors.primary} />
                    </Pressable>
                    {estaAbierta && (
                      <View style={styles.recetaCuerpo}>
                        {receta.ademas.length > 0 && (
                          <Text style={styles.recetaAdemas}>También necesitás: {receta.ademas.join(', ')}</Text>
                        )}
                        {receta.pasos.map((paso, n) => (
                          <View key={n} style={styles.paso}>
                            <Text style={styles.pasoNumero}>{n + 1}</Text>
                            <Text style={styles.pasoTexto}>{paso}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>

          <Button label="Otras ideas" variant="outline" onPress={pedir} disabled={cargando} />
          <Text style={styles.nota}>Ideas generadas automáticamente: revisá siempre el estado de los alimentos.</Text>
        </Pressable>
      </Pressable>
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
      maxHeight: '88%',
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
    encabezado: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      ...typography.h3,
      color: colors.textPrimary,
    },
    subtitulo: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    contenido: {
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    centro: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xl,
    },
    texto: {
      ...typography.body,
      color: colors.textSecondary,
    },
    error: {
      ...typography.body,
      color: colors.danger,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    receta: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    recetaEncabezado: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.primaryLight,
    },
    recetaTextos: {
      flex: 1,
      gap: 2,
    },
    recetaTitulo: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    recetaDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    recetaCuerpo: {
      padding: spacing.md,
      gap: spacing.sm,
    },
    recetaAdemas: {
      ...typography.caption,
      color: colors.textSecondary,
      fontStyle: 'italic',
    },
    paso: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    pasoNumero: {
      ...typography.bodyMedium,
      color: colors.primary,
      minWidth: 18,
    },
    pasoTexto: {
      ...typography.body,
      color: colors.textPrimary,
      flex: 1,
    },
    nota: {
      ...typography.caption,
      color: colors.textSecondary,
      textAlign: 'center',
    },
  });
