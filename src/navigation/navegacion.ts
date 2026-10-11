import { createNavigationContainerRef } from '@react-navigation/native';
import type { AppStackParamList } from '../types/navigation';

/**
 * Referencia a la navegación para usarla desde fuera de una pantalla (por
 * ejemplo, al tocar una notificación del sistema con la app cerrada, que la
 * maneja NotificacionesContext, que vive por encima del NavigationContainer).
 * RootNavigator se la pasa a su <NavigationContainer ref={...}>.
 */
export const navegacion = createNavigationContainerRef<AppStackParamList>();

// Abre la campanita si la navegación ya está lista (si no, no hace nada: la
// app recién está arrancando y el usuario la verá en Home).
export function irANotificaciones(): void {
  if (navegacion.isReady()) navegacion.navigate('Notificaciones');
}
