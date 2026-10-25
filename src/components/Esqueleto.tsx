import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../theme';
import { useEstilos } from '../theme/useEstilos';

/**
 * Silueta de carga: la forma de lo que va a aparecer (filas grises que
 * "laten") en vez del circulito que gira. Se siente más rápido porque la
 * pantalla ya tiene su forma mientras llegan los datos.
 *
 * `filas`: cuántas filas dibujar. `conFoto`: cuadradito a la izquierda (como
 * las tarjetas de productos).
 */
export function EsqueletoLista({ filas = 3, conFoto = false }: { filas?: number; conFoto?: boolean }) {
  const styles = useEstilos(crearEstilos);
  const latido = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(latido, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    animacion.start();
    return () => animacion.stop();
  }, [latido]);

  return (
    <Animated.View style={[styles.lista, { opacity: latido }]} accessibilityLabel="Cargando" accessibilityRole="progressbar">
      {Array.from({ length: filas }, (_, i) => (
        <View key={i} style={styles.fila}>
          {conFoto && <View style={styles.foto} />}
          <View style={styles.textos}>
            {/* Anchos distintos en cada fila, para que no parezca una grilla. */}
            <View style={[styles.linea, { width: `${[70, 55, 80, 60][i % 4]}%` }]} />
            <View style={[styles.linea, styles.lineaChica, { width: `${[40, 30, 45, 35][i % 4]}%` }]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    lista: {
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    foto: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      backgroundColor: colors.border,
    },
    textos: {
      flex: 1,
      gap: spacing.xs,
    },
    linea: {
      height: 14,
      borderRadius: radius.pill,
      backgroundColor: colors.border,
    },
    lineaChica: {
      height: 10,
    },
  });
