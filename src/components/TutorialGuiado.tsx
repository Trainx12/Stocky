import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from './Button';
import { textoProgreso, ubicarGlobo } from '../tutorial/tutorial';
import type { PasoTutorial, Rect } from '../tutorial/tutorial';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

interface TutorialGuiadoProps {
  paso: PasoTutorial;
  indice: number;
  total: number;
  /** Dónde está en pantalla el elemento que se explica (null = cartel centrado). */
  objetivo: Rect | null;
  onSiguiente: () => void;
  onAnterior: () => void;
  onSaltar: () => void;
  onAccion: () => void;
}

// Aire alrededor del elemento resaltado, para que el aro no lo pise.
const RELLENO = 6;
// Alto estimado del cartel hasta que se mide de verdad (primer dibujo).
const ALTO_GLOBO_INICIAL = 200;

/**
 * Capa del tutorial (ver src/tutorial/tutorial.ts): oscurece toda la
 * pantalla menos el elemento que se explica, le dibuja un aro que "late",
 * una flecha y un cartel corto con "Siguiente", "Atrás", "Saltar" y, si el
 * paso lo tiene, un botón para probarlo de verdad.
 *
 * Va en un Modal transparente para quedar encima de todo (también de la
 * barra de abajo). Las coordenadas del objetivo vienen de measureInWindow,
 * que mide respecto de la ventana: por eso el Modal es statusBarTranslucent
 * en Android (así su (0,0) coincide con el de la ventana).
 *
 * Mientras está abierto, la pantalla de abajo no recibe toques: para probar
 * algo se usa el botón del cartel, que pausa el tutorial.
 */
export function TutorialGuiado({ paso, indice, total, objetivo, onSiguiente, onAnterior, onSaltar, onAccion }: TutorialGuiadoProps) {
  const styles = useEstilos(crearEstilos);
  const pantalla = useWindowDimensions();
  const [altoGlobo, setAltoGlobo] = useState(ALTO_GLOBO_INICIAL);

  // Aro que late alrededor del objetivo: llama la atención como en un juego.
  const latido = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const animacion = Animated.loop(
      Animated.sequence([
        Animated.timing(latido, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(latido, { toValue: 0, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    animacion.start();
    return () => animacion.stop();
  }, [latido]);

  // Cada paso nuevo entra con un fundido corto.
  const aparicion = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    aparicion.setValue(0);
    Animated.timing(aparicion, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [paso.id, aparicion]);

  const hueco = objetivo
    ? {
        x: Math.max(objetivo.x - RELLENO, 0),
        y: Math.max(objetivo.y - RELLENO, 0),
        ancho: objetivo.ancho + RELLENO * 2,
        alto: objetivo.alto + RELLENO * 2,
      }
    : null;
  const ubicacion = ubicarGlobo(hueco, { ancho: pantalla.width, alto: pantalla.height }, altoGlobo);
  // Ancho fijo (como mucho ANCHO_MAXIMO, para la web en computadora) y
  // corrido hacia el objetivo, sin salirse de la pantalla.
  const anchoGlobo = Math.min(pantalla.width - spacing.md * 2, ANCHO_MAXIMO);
  const izquierdaGlobo = Math.min(
    Math.max(ubicacion.flechaX - anchoGlobo / 2, spacing.md),
    pantalla.width - spacing.md - anchoGlobo,
  );
  // La flecha se posiciona respecto del cartel y nunca se sale de sus
  // esquinas redondeadas.
  const izquierdaFlecha = Math.min(
    Math.max(ubicacion.flechaX - izquierdaGlobo - TAMANO_FLECHA / 2, radius.lg),
    anchoGlobo - radius.lg - TAMANO_FLECHA,
  );
  const esPrimero = indice === 0;
  const esUltimo = indice === total - 1;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={onSaltar}>
      <View style={StyleSheet.absoluteFill}>
        {/* Fondo oscuro con un "hueco" sobre el objetivo: cuatro rectángulos
            alrededor (arriba, abajo, izquierda, derecha). */}
        {hueco ? (
          <>
            <View style={[styles.sombra, { top: 0, left: 0, right: 0, height: hueco.y }]} />
            <View style={[styles.sombra, { top: hueco.y + hueco.alto, left: 0, right: 0, bottom: 0 }]} />
            <View style={[styles.sombra, { top: hueco.y, left: 0, width: hueco.x, height: hueco.alto }]} />
            <View style={[styles.sombra, { top: hueco.y, left: hueco.x + hueco.ancho, right: 0, height: hueco.alto }]} />
            <Animated.View
              pointerEvents="none"
              style={[
                styles.aro,
                {
                  top: hueco.y,
                  left: hueco.x,
                  width: hueco.ancho,
                  height: hueco.alto,
                  opacity: latido.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
                  transform: [{ scale: latido.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
                },
              ]}
            />
          </>
        ) : (
          <View style={[styles.sombra, StyleSheet.absoluteFill]} />
        )}

        {/* Cartel con la explicación. */}
        <Animated.View
          style={[styles.globo, { top: ubicacion.top, left: izquierdaGlobo, width: anchoGlobo, opacity: aparicion }]}
          onLayout={(e) => setAltoGlobo(e.nativeEvent.layout.height)}
          accessibilityViewIsModal
        >
          {ubicacion.flecha && (
            <View
              style={[
                styles.flecha,
                ubicacion.flecha === 'arriba' ? styles.flechaArriba : styles.flechaAbajo,
                { left: izquierdaFlecha },
              ]}
            />
          )}

          <View style={styles.encabezado}>
            <Text style={styles.progreso}>{textoProgreso(indice, total)}</Text>
            {!esUltimo && (
              <Pressable onPress={onSaltar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Saltar tutorial">
                <Text style={styles.saltar}>Saltar</Text>
              </Pressable>
            )}
          </View>

          <Text style={styles.titulo}>{paso.titulo}</Text>
          <Text style={styles.texto}>{paso.texto}</Text>

          {/* Puntitos de progreso, como en el onboarding. */}
          <View style={styles.puntos}>
            {Array.from({ length: total }, (_, i) => (
              <View key={i} style={[styles.punto, i === indice && styles.puntoActivo]} />
            ))}
          </View>

          {paso.accion && <Button label={paso.accion.etiqueta} onPress={onAccion} />}

          <View style={styles.botones}>
            {!esPrimero ? (
              <Pressable onPress={onAnterior} style={styles.botonChico} accessibilityRole="button">
                <Ionicons name="chevron-back" size={16} color={colors.textSecondary} />
                <Text style={styles.botonChicoTexto}>Atrás</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable onPress={onSiguiente} style={styles.botonSiguiente} accessibilityRole="button">
              <Text style={styles.botonSiguienteTexto}>
                {esUltimo ? '¡Empezar!' : esPrimero ? 'Empezar el tutorial' : paso.accion ? 'Ahora no, seguir' : 'Siguiente'}
              </Text>
              {!esUltimo && <Ionicons name="chevron-forward" size={16} color={colors.white} />}
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const TAMANO_FLECHA = 16;
const ANCHO_MAXIMO = 420;

const crearEstilos = () =>
  StyleSheet.create({
    sombra: {
      position: 'absolute',
      backgroundColor: 'rgba(10, 6, 20, 0.72)',
    },
    aro: {
      position: 'absolute',
      borderRadius: radius.md,
      borderWidth: 3,
      borderColor: colors.white,
    },
    globo: {
      position: 'absolute',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.md,
      gap: spacing.sm,
    },
    flecha: {
      position: 'absolute',
      width: TAMANO_FLECHA,
      height: TAMANO_FLECHA,
      backgroundColor: colors.surface,
      transform: [{ rotate: '45deg' }],
    },
    flechaArriba: {
      top: -TAMANO_FLECHA / 2,
    },
    flechaAbajo: {
      bottom: -TAMANO_FLECHA / 2,
    },
    encabezado: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progreso: {
      ...typography.caption,
      color: colors.primary,
    },
    saltar: {
      ...typography.caption,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
    titulo: {
      ...typography.h3,
      color: colors.textPrimary,
    },
    texto: {
      ...typography.body,
      color: colors.textSecondary,
    },
    puntos: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginVertical: spacing.xs,
    },
    punto: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    puntoActivo: {
      width: 18,
      backgroundColor: colors.primary,
    },
    botones: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    botonChico: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingVertical: spacing.xs,
    },
    botonChicoTexto: {
      ...typography.bodyMedium,
      color: colors.textSecondary,
    },
    botonSiguiente: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    botonSiguienteTexto: {
      ...typography.bodyMedium,
      color: colors.white,
    },
  });
