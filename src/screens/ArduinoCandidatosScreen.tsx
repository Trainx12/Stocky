import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { Button } from '../components/Button';
import {
  confirmarCandidatoArduino,
  descartarCandidatoArduino,
  listarCandidatosArduinoPendientes,
} from '../services/integracionArduinoTemporal';
import { parsearNumero } from '../services/productos';
import type { CandidatoArduino } from '../types/database';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'ArduinoCandidatos'>;

/**
 * INTEGRACIÓN ARDUINO (temporal) — ver docs/integracion-arduino-temporal.md.
 *
 * Bandeja de candidatos pendientes (`candidatos_arduino`, estado
 * 'pendiente') que detectó la Edge Function arduino-reconocer-foto a partir
 * de una foto del dispositivo ESP32-CAM. El usuario puede ajustar
 * nombre/categoría/cantidad/unidad antes de "Cargar al hogar" (crea el
 * Producto real vía confirmarCandidatoArduino) o "Descartar" sin guardar
 * nada. Nunca se crea un Producto sin este paso manual.
 */
export function ArduinoCandidatosScreen({ route }: Props) {
  const { hogarId, hogarNombre } = route.params;

  const [candidatos, setCandidatos] = useState<CandidatoArduino[]>([]);
  const [loading, setLoading] = useState(true);
  // Edición en vuelo por candidato (nombre/categoría/cantidad que el
  // usuario puede corregir antes de confirmar). Se inicializa con lo que
  // detectó Gemini apenas se cargan los candidatos.
  const [ediciones, setEdiciones] = useState<Record<string, { nombre: string; categoria: string; cantidad: string }>>({});
  // Ids con una confirmación/descarte en vuelo, para deshabilitar sus
  // botones mientras se resuelve.
  const [procesandoIds, setProcesandoIds] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const datos = await listarCandidatosArduinoPendientes(hogarId);
      setCandidatos(datos);
      setEdiciones(
        Object.fromEntries(
          datos.map((c) => [c.id, { nombre: c.nombre, categoria: c.categoria ?? '', cantidad: String(c.cantidad) }]),
        ),
      );
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar los candidatos del Arduino.');
    } finally {
      setLoading(false);
    }
  }, [hogarId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function marcarProcesando(id: string, procesando: boolean) {
    setProcesandoIds((prev) => {
      const siguiente = new Set(prev);
      if (procesando) siguiente.add(id);
      else siguiente.delete(id);
      return siguiente;
    });
  }

  async function handleCargarAlHogar(candidato: CandidatoArduino) {
    const edicion = ediciones[candidato.id];
    if (!edicion.nombre.trim()) {
      avisar('Falta el nombre', 'Completá el nombre del producto antes de cargarlo.');
      return;
    }
    if (!edicion.categoria.trim()) {
      avisar('Falta la categoría', 'Completá una categoría antes de cargarlo.');
      return;
    }

    marcarProcesando(candidato.id, true);
    try {
      await confirmarCandidatoArduino(candidato, {
        nombre: edicion.nombre,
        categoria: edicion.categoria,
        unidad: candidato.unidad,
        cantidad: parsearNumero(edicion.cantidad),
      });
      setCandidatos((prev) => prev.filter((c) => c.id !== candidato.id));
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cargar el producto al hogar.');
    } finally {
      marcarProcesando(candidato.id, false);
    }
  }

  async function handleDescartar(candidato: CandidatoArduino) {
    const confirmado = await confirmar('Descartar candidato', `¿Descartar "${candidato.nombre}" sin cargarlo al hogar?`, 'Descartar');
    if (!confirmado) return;

    marcarProcesando(candidato.id, true);
    try {
      await descartarCandidatoArduino(candidato.id);
      setCandidatos((prev) => prev.filter((c) => c.id !== candidato.id));
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo descartar el candidato.');
    } finally {
      marcarProcesando(candidato.id, false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.titulo}>Candidatos del Arduino</Text>
        <Text style={styles.subtitulo}>Detectados para "{hogarNombre}" · integración temporal</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : candidatos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="camera-outline" size={28} color={colors.textSecondary} />
          <Text style={styles.emptyText}>Todavía no hay fotos pendientes de confirmar.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.lista} showsVerticalScrollIndicator={false}>
          {candidatos.map((candidato) => {
            const edicion = ediciones[candidato.id];
            const procesando = procesandoIds.has(candidato.id);
            return (
              <View key={candidato.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Ionicons name={candidato.tipo === 'ticket' ? 'receipt-outline' : 'basket-outline'} size={16} color={colors.primary} />
                  <Text style={styles.cardTipo}>{candidato.tipo === 'ticket' ? 'Línea de ticket' : 'Foto de producto'}</Text>
                  {candidato.confianza && <Text style={styles.cardConfianza}>Confianza: {candidato.confianza}</Text>}
                </View>

                <Text style={styles.label}>Nombre</Text>
                <TextInput
                  style={styles.input}
                  value={edicion.nombre}
                  onChangeText={(texto) => setEdiciones((prev) => ({ ...prev, [candidato.id]: { ...prev[candidato.id], nombre: texto } }))}
                  editable={!procesando}
                />

                <View style={styles.row}>
                  <View style={styles.rowItem}>
                    <Text style={styles.label}>Categoría</Text>
                    <TextInput
                      style={styles.input}
                      value={edicion.categoria}
                      onChangeText={(texto) =>
                        setEdiciones((prev) => ({ ...prev, [candidato.id]: { ...prev[candidato.id], categoria: texto } }))
                      }
                      editable={!procesando}
                    />
                  </View>
                  <View style={styles.rowItemChico}>
                    <Text style={styles.label}>Cantidad ({candidato.unidad})</Text>
                    <TextInput
                      style={styles.input}
                      value={edicion.cantidad}
                      onChangeText={(texto) =>
                        setEdiciones((prev) => ({ ...prev, [candidato.id]: { ...prev[candidato.id], cantidad: texto } }))
                      }
                      keyboardType="numeric"
                      editable={!procesando}
                    />
                  </View>
                </View>

                {candidato.marca && <Text style={styles.marca}>Marca detectada: {candidato.marca}</Text>}

                <View style={styles.acciones}>
                  <Button
                    label="Descartar"
                    variant="outline"
                    onPress={() => handleDescartar(candidato)}
                    disabled={procesando}
                    style={styles.accionBoton}
                  />
                  <Button
                    label="Cargar al hogar"
                    onPress={() => handleCargarAlHogar(candidato)}
                    loading={procesando}
                    disabled={procesando}
                    style={styles.accionBoton}
                  />
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
  header: {
    gap: 2,
    marginBottom: spacing.md,
  },
  titulo: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitulo: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  loader: {
    marginTop: spacing.xl,
  },
  empty: {
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
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  cardTipo: {
    ...typography.caption,
    color: colors.primary,
    flex: 1,
  },
  cardConfianza: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowItem: {
    flex: 2,
  },
  rowItemChico: {
    flex: 1,
  },
  marca: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  acciones: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  accionBoton: {
    flex: 1,
  },
});
