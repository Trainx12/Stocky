import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing } from '../theme';

/**
 * Para las hojas que suben desde abajo (Modal + backdrop + sheet): que el
 * teclado y la barra de navegación de Android no tapen lo que se está
 * escribiendo ni los botones.
 *
 * Android dibuja la app de borde a borde (también debajo de los botones ◀ ● ■
 * y del teclado), así que la ventana no se achica sola cuando aparece el
 * teclado. `EvitarTeclado` va entre el Modal y el backdrop y empuja la hoja
 * hacia arriba lo que mide el teclado; adentro, el ScrollView de la hoja se
 * encarga de dejar a la vista el campo con el foco. En la web no hace falta
 * (el navegador ya acomoda la página).
 */
export function EvitarTeclado({ children }: { children: React.ReactNode }) {
  if (Platform.OS === 'web') return <>{children}</>;
  return (
    <KeyboardAvoidingView style={estilos.flex} behavior="padding">
      {children}
    </KeyboardAvoidingView>
  );
}

/**
 * Relleno de abajo de la hoja: el de diseño (`base`) más lo que ocupa la barra
 * de navegación del celular, para que los últimos botones no queden debajo de
 * ella (incidentes-sprint10.md #29).
 */
export function useRellenoInferior(base: number = spacing.xl): number {
  return base + useSafeAreaInsets().bottom;
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
});
