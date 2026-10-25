import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { registrarHostDeCelebracion } from '../lib/celebrar';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

/**
 * El "¡Listo!" animado de celebrar() (src/lib/celebrar.ts): un tilde verde
 * que aparece con un rebote en el centro y se va solo en menos de un
 * segundo y medio. No tapa los toques (pointerEvents none): no hay que
 * cerrarlo ni esperarlo.
 */
export function CelebracionHost() {
  const styles = useEstilos(crearEstilos);
  const [texto, setTexto] = useState<string | null>(null);
  const escala = useRef(new Animated.Value(0)).current;
  const opacidad = useRef(new Animated.Value(0)).current;

  useEffect(
    () =>
      registrarHostDeCelebracion((nuevo) => {
        setTexto(nuevo);
        escala.setValue(0.4);
        opacidad.setValue(0);
        const nativo = Platform.OS !== 'web';
        Animated.sequence([
          Animated.parallel([
            Animated.spring(escala, { toValue: 1, friction: 4, tension: 120, useNativeDriver: nativo }),
            Animated.timing(opacidad, { toValue: 1, duration: 150, useNativeDriver: nativo }),
          ]),
          Animated.delay(650),
          Animated.timing(opacidad, { toValue: 0, duration: 250, easing: Easing.in(Easing.ease), useNativeDriver: nativo }),
        ]).start(() => setTexto(null));
      }),
    [escala, opacidad],
  );

  if (!texto) return null;
  return (
    <View style={styles.capa} pointerEvents="none">
      <Animated.View style={[styles.tarjeta, { opacity: opacidad, transform: [{ scale: escala }] }]} accessibilityRole="alert">
        <View style={styles.circulo}>
          <Ionicons name="checkmark" size={44} color={colors.white} />
        </View>
        <Text style={styles.texto}>{texto}</Text>
      </Animated.View>
    </View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    capa: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1100,
      elevation: 1100,
    },
    tarjeta: {
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.xl,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 14,
      elevation: 10,
    },
    circulo: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.success,
    },
    texto: {
      ...typography.h3,
      color: colors.textPrimary,
    },
  });
