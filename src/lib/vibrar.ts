import { Platform } from 'react-native';

/**
 * Vibración cortita para confirmar un toque sin mirar (los botones + y − de
 * las cantidades).
 *
 * expo-haptics es un módulo nativo: los APK instalados antes de agregarlo no
 * lo tienen, y como las actualizaciones (eas update) les llegan igual, un
 * import directo haría fallar la pantalla. Por eso se carga con require
 * dentro de un try: si el APK no lo trae, simplemente no vibra. Empieza a
 * vibrar con el próximo APK. En la web no hace nada.
 */
type Haptics = typeof import('expo-haptics');

let haptics: Haptics | null | undefined;

function cargarHaptics(): Haptics | null {
  if (haptics !== undefined) return haptics;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    haptics = Platform.OS === 'web' ? null : (require('expo-haptics') as Haptics);
  } catch {
    haptics = null;
  }
  return haptics;
}

export function vibrarToque(): void {
  const h = cargarHaptics();
  if (!h) return;
  h.impactAsync(h.ImpactFeedbackStyle.Light).catch(() => {
    // Sin vibrador o desactivado en el sistema: no pasa nada.
  });
}
