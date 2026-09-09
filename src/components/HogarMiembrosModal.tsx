import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  cederDueno,
  expulsarMiembro,
  invitarAHogar,
  listarMiembrosDeHogar,
  listarSolicitudesPendientes,
  permitirEditarHogar,
  responderSolicitud,
} from '../services/hogares';
import type { MiembroHogar, SolicitudPendiente } from '../services/hogares';
import { Button } from './Button';
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
  const [solicitudes, setSolicitudes] = useState<SolicitudPendiente[]>([]);
  const [loading, setLoading] = useState(false);

  // Input de "invitar por mail" (ver migración
  // 20260908120000_invitar_por_email.sql). Solo lo usa el dueño, así que se
  // limpia cada vez que se cierra el modal para no arrastrar el mail de la
  // última vez.
  const [emailInvitar, setEmailInvitar] = useState('');
  const [invitando, setInvitando] = useState(false);

  const cargar = useCallback(async () => {
    if (!hogarId) return;
    setLoading(true);
    try {
      // Se piden en paralelo: son dos consultas independientes (miembros ya
      // aceptados vs. solicitudes pendientes, ver migración
      // 20260903120000_solicitudes_hogar.sql) que alimentan dos listas
      // separadas de esta misma pantalla.
      const [miembrosData, solicitudesData] = await Promise.all([
        listarMiembrosDeHogar(hogarId),
        listarSolicitudesPendientes(hogarId),
      ]);
      setMiembros(miembrosData);
      setSolicitudes(solicitudesData);
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
    else setEmailInvitar('');
  }, [visible, cargar]);

  // Soy dueño de este hogar si mi propia fila en la lista dice rol "dueno".
  const soyDueno = miembros.some((m) => m.usuarioId === usuarioActualId && m.rol === 'dueno');

  // Aceptar o rechazar la solicitud de un invitado puntual. El "no" no
  // pide confirmación (no es tan destructivo como expulsar a alguien que
  // ya era miembro: el invitado puede volver a mandar el código), pero el
  // dueño lo hace explícitamente tocando el botón correspondiente.
  async function handleResponderSolicitud(solicitud: SolicitudPendiente, aprobar: boolean) {
    if (!hogarId) return;
    try {
      await responderSolicitud(hogarId, solicitud.usuarioId, aprobar);
      await cargar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo responder la solicitud.');
    }
  }

  // Invita a alguien por mail (solo funciona si ya tiene cuenta en Stocky,
  // ver migración 20260908120000_invitar_por_email.sql). Los errores de la
  // RPC (mail sin cuenta, ya es miembro, etc.) llegan legibles desde
  // Postgres, se muestran tal cual con avisar().
  async function handleInvitar() {
    if (!hogarId || !emailInvitar.trim()) return;
    setInvitando(true);
    try {
      await invitarAHogar(hogarId, emailInvitar.trim());
      setEmailInvitar('');
      avisar('Invitación enviada', 'Le avisamos apenas la acepte o la rechace.');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo enviar la invitación.');
    } finally {
      setInvitando(false);
    }
  }

  // Ceder el dueño es fuerte (dejo de poder expulsar/editar permisos y
  // paso a depender del nuevo dueño para todo eso), por eso pide
  // confirmación explícita, igual que expulsar.
  async function handleCederDueno(miembro: MiembroHogar) {
    if (!hogarId) return;
    const nombreMostrado = miembro.nombre ?? miembro.email;
    const confirmado = await confirmar(
      'Ceder el rol de dueño',
      `¿Seguro que querés que "${nombreMostrado}" pase a ser el dueño de "${hogarNombre}"? Vos vas a quedar como invitado.`,
      'Ceder dueño',
    );
    if (!confirmado) return;

    try {
      await cederDueno(hogarId, miembro.usuarioId);
      await cargar();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo ceder el rol de dueño.');
    }
  }

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

  // Actualista optimista (cambia el switch al toque) + revierte si la RPC
  // falla, para que el toggle se sienta inmediato sin esperar el roundtrip.
  async function handlePermitirEditar(miembro: MiembroHogar, permitir: boolean) {
    if (!hogarId) return;
    setMiembros((actuales) => actuales.map((m) => (m.usuarioId === miembro.usuarioId ? { ...m, puedeEditar: permitir } : m)));

    try {
      await permitirEditarHogar(hogarId, miembro.usuarioId, permitir);
    } catch (err) {
      setMiembros((actuales) =>
        actuales.map((m) => (m.usuarioId === miembro.usuarioId ? { ...m, puedeEditar: !permitir } : m)),
      );
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cambiar el permiso de edición.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Miembros de {hogarNombre}</Text>

          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <>
              {/* Invitar por mail: solo el dueño la ve, y solo funciona si
                  ese mail ya tiene cuenta creada en Stocky (ver migración
                  20260908120000_invitar_por_email.sql). */}
              {soyDueno && (
                <View style={styles.invitarRow}>
                  <TextInput
                    style={styles.invitarInput}
                    placeholder="Invitar por mail"
                    placeholderTextColor={colors.textSecondary}
                    value={emailInvitar}
                    onChangeText={setEmailInvitar}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!invitando}
                  />
                  <Button
                    label="Invitar"
                    onPress={handleInvitar}
                    loading={invitando}
                    disabled={!emailInvitar.trim()}
                    style={styles.invitarButton}
                  />
                </View>
              )}

              {/* Solo el dueño ve y resuelve las solicitudes pendientes --
                  un invitado ni siquiera llega a ver quién más pidió
                  sumarse (ver migración 20260903120000_solicitudes_hogar.sql). */}
              {soyDueno && solicitudes.length > 0 && (
                <View style={styles.list}>
                  <Text style={styles.subtitle}>Solicitudes pendientes</Text>
                  {solicitudes.map((solicitud) => (
                    <View key={solicitud.usuarioId} style={styles.rowContainer}>
                      <View style={styles.row}>
                        <Text style={styles.rowNombre} numberOfLines={1}>
                          {solicitud.nombre ?? solicitud.email}
                        </Text>
                        <View style={styles.solicitudAcciones}>
                          <Pressable
                            onPress={() => handleResponderSolicitud(solicitud, true)}
                            style={styles.solicitudButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Aceptar a ${solicitud.nombre ?? solicitud.email}`}
                          >
                            <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary} />
                          </Pressable>
                          <Pressable
                            onPress={() => handleResponderSolicitud(solicitud, false)}
                            style={styles.solicitudButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Rechazar a ${solicitud.nombre ?? solicitud.email}`}
                          >
                            <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {miembros.length === 0 ? (
                <Text style={styles.emptyText}>No se encontraron miembros.</Text>
              ) : (
                <View style={styles.list}>
                  {miembros.map((miembro) => (
                    <View key={miembro.usuarioId} style={styles.rowContainer}>
                      <View style={styles.row}>
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

                        {/* Agrupadas en un solo contenedor a propósito: si
                            quedan como hermanos sueltos de rowTextos, el
                            justify-content: space-between de "row" las
                            reparte por separado y, en pantallas anchas
                            (web/desktop), el botón del medio termina flotando
                            solo en el centro de la pantalla en vez de al
                            lado del de expulsar. */}
                        {soyDueno && miembro.rol === 'invitado' && (
                          <View style={styles.miembroAcciones}>
                            <Pressable
                              onPress={() => handleCederDueno(miembro)}
                              style={styles.cederDuenoButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Hacer dueño a ${miembro.nombre ?? miembro.email}`}
                            >
                              <Text style={styles.cederDuenoTexto}>Hacer dueño</Text>
                            </Pressable>
                            <Pressable
                              onPress={() => handleExpulsar(miembro)}
                              style={styles.expulsarButton}
                              accessibilityRole="button"
                              accessibilityLabel={`Expulsar a ${miembro.nombre ?? miembro.email}`}
                            >
                              <Ionicons name="person-remove-outline" size={20} color={colors.danger} />
                            </Pressable>
                          </View>
                        )}
                      </View>

                      {/* El dueño puede habilitar/deshabilitar que ESTE invitado
                          puntual edite el nombre del hogar. Default false (ver
                          migración 20260828120000_permisos_editar_hogar.sql):
                          un invitado no puede editar salvo que el dueño lo
                          habilite acá explícitamente. */}
                      {soyDueno && miembro.rol === 'invitado' && (
                        <View style={styles.permisoRow}>
                          <Text style={styles.permisoTexto}>Puede editar el nombre del hogar</Text>
                          <Switch
                            value={miembro.puedeEditar}
                            onValueChange={(valor) => handlePermitirEditar(miembro, valor)}
                            trackColor={{ true: colors.primary, false: colors.border }}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  invitarRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  invitarInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  invitarButton: {
    flexShrink: 0,
  },
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
  subtitle: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  list: {
    gap: spacing.xs,
  },
  solicitudAcciones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  solicitudButton: {
    padding: spacing.xs,
  },
  rowContainer: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  permisoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
  },
  permisoTexto: {
    ...typography.caption,
    color: colors.textSecondary,
    flexShrink: 1,
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
  miembroAcciones: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cederDuenoButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cederDuenoTexto: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
