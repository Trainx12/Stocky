import { Alert, Platform } from 'react-native';

/**
 * `Alert.alert()` de React Native es un no-op en react-native-web (la
 * implementación web del paquete es literalmente `static alert() {}`): no
 * muestra nada y no dispara ningún callback ahí, así que cualquier flujo
 * que dependa de sus botones (confirmar/cancelar) queda roto en silencio
 * en la versión web — ver docs/incidentes-sprint3.md. Estos dos helpers
 * son el reemplazo cross-platform: nativo sigue usando `Alert.alert` real,
 * web usa `window.alert`/`window.confirm`.
 */

// Mensaje informativo con un solo botón (errores, avisos).
export function avisar(titulo: string, mensaje: string): void {
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensaje}`);
    return;
  }
  Alert.alert(titulo, mensaje);
}

// Confirmación sí/no. Devuelve una Promise (en vez de recibir un callback
// como Alert.alert) para poder hacer `await` en el caller, igual que con
// las llamadas a Supabase que suelen ir justo antes/después.
export function confirmar(titulo: string, mensaje: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${titulo}\n\n${mensaje}`));
  }
  return new Promise((resolve) => {
    Alert.alert(titulo, mensaje, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
