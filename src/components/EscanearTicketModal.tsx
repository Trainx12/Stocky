import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { obtenerFotoBase64 } from '../lib/fotos';
import type { OrigenFoto } from '../lib/fotos';
import { listarCatalogoAprobado } from '../services/catalogo';
import { armarCandidatos } from '../services/escaneo';
import type { CandidatoTicket } from '../services/escaneo';
import { reconocerProductosDeTicket } from '../services/externalApis';
import { crearProducto, parsearNumero } from '../services/productos';
import { colors, radius, spacing, typography } from '../theme';

interface EscanearTicketModalProps {
  visible: boolean;
  onClose: () => void;
  /** Se llama cuando se guardó al menos un producto, con la cantidad guardada. */
  onSuccess: (cantidadGuardada: number) => void;
  hogarId: string;
}

type Paso = 'elegir' | 'procesando' | 'revisar' | 'vacio';

/**
 * RF4 — Foto de un ticket -> productos candidatos -> el usuario revisa,
 * corrige cantidades o descarta -> recién ahí se guardan. Nunca se guarda
 * nada directo desde el OCR (plan de testing, Sprint 6). Si el ticket no se
 * puede leer, el paso 'vacio' deja volver a intentar o cargar a mano.
 *
 * Solo se guardan las líneas que coinciden con un producto del catálogo:
 * todo producto del hogar sale del catálogo (ver ProductoFormModal), el
 * resto se muestra aparte para que se agregue a mano.
 */
export function EscanearTicketModal({ visible, onClose, onSuccess, hogarId }: EscanearTicketModalProps) {
  const [paso, setPaso] = useState<Paso>('elegir');
  const [candidatos, setCandidatos] = useState<CandidatoTicket[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPaso('elegir');
    setCandidatos([]);
    setGuardando(false);
    setError(null);
  }, [visible]);

  async function handleElegirFoto(origen: OrigenFoto) {
    setError(null);
    try {
      const imagen = await obtenerFotoBase64(origen);
      if (!imagen) return; // canceló el selector

      setPaso('procesando');
      const [reconocidos, catalogo] = await Promise.all([reconocerProductosDeTicket(imagen), listarCatalogoAprobado()]);
      const armados = armarCandidatos(reconocidos, catalogo);

      setCandidatos(armados);
      setPaso(armados.length === 0 ? 'vacio' : 'revisar');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el ticket.');
      setPaso('elegir');
    }
  }

  function handleCambiarCantidad(id: string, cantidad: string) {
    setCandidatos((actuales) => actuales.map((c) => (c.id === id ? { ...c, cantidad } : c)));
  }

  function handleDescartar(id: string) {
    setCandidatos((actuales) => actuales.filter((c) => c.id !== id));
  }

  const guardables = candidatos.filter((c) => c.catalogo !== null);
  const sinCatalogo = candidatos.filter((c) => c.catalogo === null);

  async function handleConfirmar() {
    setGuardando(true);
    setError(null);

    const fallidos: CandidatoTicket[] = [];
    let guardados = 0;
    let ultimoError: string | null = null;

    for (const candidato of guardables) {
      const catalogo = candidato.catalogo!;
      try {
        await crearProducto(hogarId, {
          nombre: catalogo.nombre,
          categoria: catalogo.categoria,
          unidad: catalogo.unidad,
          cantidad: parsearNumero(candidato.cantidad),
          stockMinimo: 0,
          fechaVencimiento: null,
          alertaVencimientoHabilitada: true,
          catalogoId: catalogo.id,
        });
        guardados += 1;
      } catch (err) {
        fallidos.push(candidato);
        ultimoError = err instanceof Error ? err.message : 'Error desconocido';
      }
    }

    setGuardando(false);

    if (fallidos.length === 0) {
      onSuccess(guardados);
      return;
    }

    // Se dejan en pantalla solo los que fallaron (más los que no tenían
    // catálogo) para poder corregirlos y reintentar sin duplicar los ya
    // guardados.
    setCandidatos([...fallidos, ...sinCatalogo]);
    setError(`No se pudieron guardar ${fallidos.length} producto(s): ${ultimoError}`);
    if (guardados > 0) onSuccess(guardados);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Escanear ticket</Text>

            {paso === 'elegir' && (
              <View style={styles.bloque}>
                <Text style={styles.texto}>
                  Sacale una foto al ticket de compra. Te mostramos los productos que detectamos para que los revises antes de
                  guardarlos.
                </Text>
                {error && <Text style={styles.error}>{error}</Text>}
                <Button label="Sacar foto" onPress={() => handleElegirFoto('camara')} />
                <Button label="Elegir de la galería" variant="outline" onPress={() => handleElegirFoto('galeria')} />
              </View>
            )}

            {paso === 'procesando' && (
              <View style={styles.centro}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.texto}>Leyendo el ticket...</Text>
              </View>
            )}

            {paso === 'vacio' && (
              <View style={styles.bloque}>
                <Ionicons name="receipt-outline" size={28} color={colors.textSecondary} style={styles.iconoCentro} />
                <Text style={styles.texto}>
                  No pudimos reconocer productos en esa foto. Probá con más luz y el ticket bien plano, o cargá los productos
                  a mano.
                </Text>
                <Button label="Probar con otra foto" onPress={() => setPaso('elegir')} />
                <Button label="Cargar a mano" variant="outline" onPress={onClose} />
              </View>
            )}

            {paso === 'revisar' && (
              <View style={styles.bloque}>
                <Text style={styles.texto}>
                  Revisá los productos detectados. Podés corregir la cantidad o descartar los que no correspondan.
                </Text>

                {guardables.map((candidato) => (
                  <View key={candidato.id} style={styles.fila}>
                    <View style={styles.filaTextos}>
                      <Text style={styles.nombre}>{candidato.catalogo!.nombre}</Text>
                      <Text style={styles.detalle} numberOfLines={1}>
                        Detectado: {candidato.nombreDetectado}
                      </Text>
                    </View>
                    <TextInput
                      style={styles.cantidad}
                      keyboardType="numeric"
                      value={candidato.cantidad}
                      onChangeText={(texto) => handleCambiarCantidad(candidato.id, texto)}
                      editable={!guardando}
                      accessibilityLabel={`Cantidad de ${candidato.catalogo!.nombre}`}
                    />
                    <Pressable
                      onPress={() => handleDescartar(candidato.id)}
                      disabled={guardando}
                      accessibilityRole="button"
                      accessibilityLabel={`Descartar ${candidato.catalogo!.nombre}`}
                    >
                      <Ionicons name="trash-outline" size={20} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}

                {sinCatalogo.length > 0 && (
                  <View style={styles.sinCatalogo}>
                    <Text style={styles.detalle}>
                      No están en el catálogo (agregalos a mano si los necesitás): {sinCatalogo.map((c) => c.nombreDetectado).join(', ')}
                    </Text>
                  </View>
                )}

                {error && <Text style={styles.error}>{error}</Text>}

                <Button
                  label={guardables.length === 1 ? 'Agregar 1 producto' : `Agregar ${guardables.length} productos`}
                  onPress={handleConfirmar}
                  loading={guardando}
                  disabled={guardables.length === 0}
                />
              </View>
            )}
          </ScrollView>
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
    maxHeight: '85%',
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
    marginBottom: spacing.md,
  },
  bloque: {
    gap: spacing.sm,
  },
  centro: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  iconoCentro: {
    alignSelf: 'center',
  },
  texto: {
    ...typography.body,
    color: colors.textSecondary,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filaTextos: {
    flex: 1,
    gap: 2,
  },
  nombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  detalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cantidad: {
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minWidth: 56,
    textAlign: 'center',
  },
  sinCatalogo: {
    paddingVertical: spacing.xs,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
