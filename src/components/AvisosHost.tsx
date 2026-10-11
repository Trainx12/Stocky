import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  agregarAviso,
  duracionAviso,
  esAccionDestructiva,
  registrarHostDeAvisos,
} from '../lib/alert';
import type { AvisoEnPantalla, Confirmacion, TipoAviso } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';

// Color de la franja/ícono e ícono por defecto de cada tipo de aviso.
const ESTILO_POR_TIPO: Record<TipoAviso, { color: string; fondo: string; icono: string }> = {
  exito: { color: colors.success, fondo: colors.successLight, icono: 'checkmark-circle' },
  error: { color: colors.danger, fondo: colors.dangerLight, icono: 'alert-circle' },
  info: { color: colors.primary, fondo: colors.primaryLight, icono: 'information-circle' },
};

/**
 * Se monta una sola vez, arriba de toda la app (App.tsx), y se registra en
 * src/lib/alert.ts: desde ahí cualquier `avisar()` muestra un cartelito
 * arriba de la pantalla y cualquier `confirmar()` un diálogo con el diseño
 * de Stocky, en vez del "localhost dice..." del navegador o el diálogo del
 * sistema. Ver el comentario de alert.ts.
 */
export function AvisosHost() {
  const insets = useSafeAreaInsets();
  const [avisos, setAvisos] = useState<AvisoEnPantalla[]>([]);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  // La Promise de confirmar() se resuelve cuando el usuario toca un botón.
  const resolverConfirmacion = useRef<((valor: boolean) => void) | null>(null);
  const siguienteId = useRef(1);

  const quitarAviso = useCallback((id: number) => {
    setAvisos((actuales) => actuales.filter((a) => a.id !== id));
  }, []);

  useEffect(
    () =>
      registrarHostDeAvisos({
        mostrarAviso: (aviso) => {
          const id = siguienteId.current++;
          setAvisos((actuales) => agregarAviso(actuales, { ...aviso, id }));
        },
        pedirConfirmacion: (datos) =>
          new Promise<boolean>((resolve) => {
            // Si había otra confirmación abierta (no debería), se cancela.
            resolverConfirmacion.current?.(false);
            resolverConfirmacion.current = resolve;
            setConfirmacion(datos);
          }),
      }),
    [],
  );

  function responder(valor: boolean) {
    resolverConfirmacion.current?.(valor);
    resolverConfirmacion.current = null;
    setConfirmacion(null);
  }

  return (
    <>
      {/* box-none: los toques que no caen sobre un cartelito pasan a la pantalla de abajo. */}
      <View style={[styles.contenedor, { top: insets.top + spacing.sm }]}>
        {avisos.map((aviso) => (
          <Cartelito key={aviso.id} aviso={aviso} onCerrar={() => quitarAviso(aviso.id)} />
        ))}
      </View>

      <Modal visible={confirmacion !== null} transparent animationType="fade" onRequestClose={() => responder(false)}>
        <Pressable style={styles.fondoModal} onPress={() => responder(false)}>
          {/* El Pressable interno frena el toque para que tocar la tarjeta no cierre el diálogo. */}
          <Pressable style={styles.dialogo} onPress={() => {}}>
            <Text style={styles.dialogoTitulo}>{confirmacion?.titulo}</Text>
            <Text style={styles.dialogoMensaje}>{confirmacion?.mensaje}</Text>
            <View style={styles.dialogoBotones}>
              <Pressable onPress={() => responder(false)} style={[styles.boton, styles.botonCancelar]} accessibilityRole="button">
                <Text style={styles.botonCancelarTexto}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={() => responder(true)}
                style={[
                  styles.boton,
                  { backgroundColor: confirmacion && esAccionDestructiva(confirmacion.confirmLabel) ? colors.danger : colors.primary },
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.botonConfirmarTexto}>{confirmacion?.confirmLabel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// Un cartelito: entra deslizándose desde arriba, se va solo después de
// duracionAviso(tipo) o al tocarlo.
function Cartelito({ aviso, onCerrar }: { aviso: AvisoEnPantalla; onCerrar: () => void }) {
  const animacion = useRef(new Animated.Value(0)).current;
  const estilo = ESTILO_POR_TIPO[aviso.tipo];

  const salir = useCallback(() => {
    Animated.timing(animacion, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => onCerrar());
  }, [animacion, onCerrar]);

  useEffect(() => {
    Animated.spring(animacion, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    const timer = setTimeout(salir, duracionAviso(aviso.tipo));
    return () => clearTimeout(timer);
  }, [animacion, salir, aviso.tipo]);

  return (
    <Animated.View
      style={[
        styles.cartelito,
        { borderLeftColor: estilo.color },
        {
          opacity: animacion,
          transform: [{ translateY: animacion.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
        },
      ]}
    >
      <Pressable onPress={salir} style={styles.cartelitoContenido} accessibilityRole="alert" accessibilityLabel={`${aviso.titulo}. ${aviso.mensaje}`}>
        <View style={[styles.iconoCirculo, { backgroundColor: estilo.fondo }]}>
          <Ionicons name={(aviso.icono ?? estilo.icono) as keyof typeof Ionicons.glyphMap} size={22} color={estilo.color} />
        </View>
        <View style={styles.textos}>
          <Text style={styles.titulo} numberOfLines={1}>
            {aviso.titulo}
          </Text>
          {!!aviso.mensaje && (
            <Text style={styles.mensaje} numberOfLines={3}>
              {aviso.mensaje}
            </Text>
          )}
        </View>
        <Ionicons name="close" size={16} color={colors.textSecondary} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    gap: spacing.sm,
    zIndex: 1000,
    elevation: 1000,
    alignItems: 'center',
    pointerEvents: 'box-none',
  },
  cartelito: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  cartelitoContenido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  iconoCirculo: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textos: {
    flex: 1,
    gap: 2,
  },
  titulo: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  mensaje: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  fondoModal: {
    flex: 1,
    backgroundColor: 'rgba(27, 27, 31, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialogo: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dialogoTitulo: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  dialogoMensaje: {
    ...typography.body,
    color: colors.textSecondary,
  },
  dialogoBotones: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  boton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
  },
  botonCancelar: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  botonCancelarTexto: {
    ...typography.bodyMedium,
    color: colors.textSecondary,
  },
  botonConfirmarTexto: {
    ...typography.bodyMedium,
    color: colors.white,
  },
});
