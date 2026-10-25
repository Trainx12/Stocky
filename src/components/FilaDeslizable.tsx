import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import { accionDelDeslizamiento, UMBRAL_DESLIZAR } from './filaDeslizable.logica';

interface FilaDeslizableProps {
  children: React.ReactNode;
  /** Deslizar hacia la izquierda: "Usé 1". Sin función (o sin stock) no se puede. */
  onUsarUno?: () => void;
  /** Deslizar hacia la derecha: "Eliminar". Quien la recibe pide confirmación. */
  onEliminar?: () => void;
}

/**
 * Fila de producto que se desliza como un mail en Gmail: hacia la izquierda
 * descuenta uno ("Usé 1") y hacia la derecha elimina (la pantalla pide
 * confirmación antes, para que un toque accidental no borre nada). Mientras
 * se arrastra, aparece abajo el color y el ícono de lo que va a pasar; si se
 * suelta antes del umbral, vuelve a su lugar sin hacer nada.
 *
 * Hecho con PanResponder (sin librerías nativas): anda igual en los APK ya
 * instalados y en la web. Solo toma el gesto si es claramente horizontal,
 * así no se pelea con el scroll de la lista.
 */
export function FilaDeslizable({ children, onUsarUno, onEliminar }: FilaDeslizableProps) {
  const styles = useEstilos(crearEstilos);
  const desplazamiento = useRef(new Animated.Value(0)).current;
  // Las funciones cambian en cada render de la pantalla: se leen de una ref
  // para que el PanResponder (que se arma una sola vez) use las últimas.
  const acciones = useRef({ onUsarUno, onEliminar });
  acciones.current = { onUsarUno, onEliminar };

  const volver = () =>
    Animated.spring(desplazamiento, { toValue: 0, useNativeDriver: Platform.OS !== 'web', friction: 7 }).start();

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_e, g) => {
          const { onUsarUno: usar, onEliminar: eliminar } = acciones.current;
          // No se arrastra hacia un lado que no tiene acción.
          if ((g.dx < 0 && !usar) || (g.dx > 0 && !eliminar)) return;
          // Pasado el umbral se frena un poco (se siente el "tope").
          const limite = UMBRAL_DESLIZAR * 1.4;
          desplazamiento.setValue(Math.max(Math.min(g.dx, limite), -limite));
        },
        onPanResponderRelease: (_e, g) => {
          const accion = accionDelDeslizamiento(g.dx);
          volver();
          if (accion === 'usarUno') acciones.current.onUsarUno?.();
          if (accion === 'eliminar') acciones.current.onEliminar?.();
        },
        onPanResponderTerminate: volver,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se arma una sola vez (ver acciones)
    [desplazamiento],
  );

  // Qué fondo se ve según para dónde se arrastra.
  const opacidadEliminar = desplazamiento.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' });
  const opacidadUsar = desplazamiento.interpolate({ inputRange: [-24, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <View style={styles.contenedor}>
      <Animated.View style={[styles.fondo, styles.fondoEliminar, { opacity: opacidadEliminar }]}>
        <Ionicons name="trash-outline" size={20} color={colors.white} />
        <Text style={styles.fondoTexto}>Eliminar</Text>
      </Animated.View>
      <Animated.View style={[styles.fondo, styles.fondoUsar, { opacity: opacidadUsar }]}>
        <Text style={styles.fondoTexto}>Usé 1</Text>
        <Ionicons name="remove-circle-outline" size={20} color={colors.white} />
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX: desplazamiento }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    contenedor: {
      position: 'relative',
    },
    fondo: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    fondoEliminar: {
      backgroundColor: colors.danger,
      justifyContent: 'flex-start',
    },
    fondoUsar: {
      backgroundColor: colors.primary,
      justifyContent: 'flex-end',
    },
    fondoTexto: {
      ...typography.bodyMedium,
      color: colors.white,
    },
  });
