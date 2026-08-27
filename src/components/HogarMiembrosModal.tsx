import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { expulsarMiembro, listarMiembrosDeHogar } from '../services/hogares';
import type { MiembroHogar } from '../services/hogares';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';

interface HogarMiembrosModalProps {
  visible: boolean;
  onClose: () => void;
  hogarId: string | null;
  hogarNombre: string;
  /** El id del usuario logueado, para saber si ES el dueño de este hogar (y así mostrar el botón de expulsar) y para no ofrecerle expulsarse a sí mismo. */
  usuarioActualId: string;
}

/**
 * Pantalla "Miembros del hogar": quién forma parte de un hogar puntual y
 * con qué rol (Dueño/Invitado, ver migración
 * 20260827140000_hogares_jerarquia.sql). Solo si el usuario logueado es el
 * dueño de ESE hogar aparece el botón de expulsar, y nunca sobre la fila
 * del propio dueño (la RPC ya lo rechaza del lado del servidor, pero no
 * tiene sentido ni mostrar el botón ahí).
 */
export function HogarMiembrosModal({ visible, onClose, hogarId, hogarNombre, usuarioActualId }: HogarMiembrosModalProps) {
  const [miembros, setMiembros] = useState<MiembroHogar[]>([]);
  const [loading, setLoading] = useState(false);

  const cargar = useCallback(async () => {
    if (!hogarId) return;
    setLoading(true);
    try {
      setMiembros(await listarMiembrosDeHogar(hogarId));
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar los miembros del hogar.');
    } finally {
      setLoading(false);
    }
  }, [hogarId]);

  // Recarga cada vez que se abre (no solo al montar), para reflejar
  // expulsiones/altas hechas mientras el modal estaba cerrado.
  useEffect(() => {
    if (visible) cargar();
  }, [visible, cargar]);

  // Soy dueño de este hogar si mi propia fila en la lista dice rol "dueno".
  const soyDueno = miembros.some((m) => m.usuarioId === usuarioActualId && m.rol === 'dueno');

  async function handleExpulsar(miembro: MiembroHogar) {
    if (!hogarId) return;
    const nombreMostrado = miembro.nombre ?? miembro.email;
    const confirmado = await confirmar('Expulsar miembro', `¿Seguro que querés expulsar a "${nombreMostrado}" de "${hogarNombre}"?`, 'Expulsar');
    if (!confirmado) return;

    try {
      await expulsarMiembro(hogarId, miembro.usuarioId);
      await cargar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo expulsar al miembro.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Miembros de {hogarNombre}</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : miembros.length === 0 ? (
            <Text style={styles.emptyText}>No se encontraron miembros.</Text>
          ) : (
            <View style={styles.list}>
              {miembros.map((miembro) => (
                <View key={miembro.usuarioId} style={styles.row}>
                  <View style={styles.rowTextos}>
                    <Text style={styles.rowNombre} numberOfLines={1}>
                      {miembro.nombre ?? miembro.email}
                    </Text>
                    <View style={[styles.badge, miembro.rol === 'dueno' ? styles.badgeDueno : styles.badgeInvitado]}>
                      <Text style={[styles.badgeTexto, miembro.rol === 'dueno' ? styles.badgeTextoDueno : styles.badgeTextoInvitado]}>
                        {miembro.rol === 'dueno' ? 'Dueño' : 'Invitado'}
                      </Text>
                    </View>
                  </View>

                  {soyDueno && miembro.rol === 'invitado' && (
                    <Pressable
                      onPress={() => handleExpulsar(miembro)}
                      style={styles.expulsarButton}
                      accessibilityRole="button"
                      accessibilityLabel={`Expulsar a ${miembro.nombre ?? miembro.email}`}
                    >
                      <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          )}
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
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowTextos: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeDueno: {
    backgroundColor: colors.primaryLight,
  },
  badgeInvitado: {
    backgroundColor: colors.background,
  },
  badgeTexto: {
    ...typography.caption,
  },
  badgeTextoDueno: {
    color: colors.primary,
  },
  badgeTextoInvitado: {
    color: colors.textSecondary,
  },
  expulsarButton: {
    padding: spacing.xs,
  },
});
