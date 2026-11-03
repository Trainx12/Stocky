import { Alert, Platform } from 'react-native';

/**
 * Avisos y confirmaciones de toda la app.
 *
 * Historia: `Alert.alert()` es un no-op en react-native-web (ver
 * docs/incidentes-sprint3.md), por eso existían estos dos helpers con
 * `window.alert`/`window.confirm` para web. Pero esos diálogos son los del
 * navegador ("localhost dice...") y en el celular son los del sistema,
 * nada que ver con el diseño de Stocky.
 *
 * Desde el Sprint 10 la app monta un `AvisosHost` (src/components/AvisosHost.tsx)
 * que se registra acá: `avisar()` muestra un cartelito arriba (verde si salió
 * bien, coral si falló, violeta si es informativo) que se va solo, y
 * `confirmar()` un diálogo propio. Las pantallas no cambian: siguen llamando
 * a `avisar()`/`confirmar()` igual que antes. Si el host todavía no se montó
 * (o en tests), se usa el comportamiento anterior.
 */

export type TipoAviso = 'exito' | 'error' | 'info';

export interface Aviso {
  titulo: string;
  mensaje: string;
  tipo: TipoAviso;
  // Ícono de Ionicons opcional (las notificaciones lo usan); si no viene,
  // el host elige uno según el tipo.
  icono?: string;
  // Botón opcional dentro del cartelito (por ejemplo "Deshacer").
  accion?: AccionDeAviso;
}

export interface AccionDeAviso {
  etiqueta: string;
  alTocar: () => void;
}

export interface Confirmacion {
  titulo: string;
  mensaje: string;
  confirmLabel: string;
}

export interface HostDeAvisos {
  mostrarAviso: (aviso: Aviso) => void;
  pedirConfirmacion: (confirmacion: Confirmacion) => Promise<boolean>;
}

let host: HostDeAvisos | null = null;

// Lo llama AvisosHost al montarse. Devuelve la función para desregistrarse
// (al desmontarse), así un host viejo no queda colgado.
export function registrarHostDeAvisos(nuevo: HostDeAvisos): () => void {
  host = nuevo;
  return () => {
    if (host === nuevo) host = null;
  };
}

// Deduce el tipo de aviso del título, para no tener que tocar los ~40
// llamados que ya existen: "Error"/"No se pudo..." es un error; "Listo",
// "Producto agregado", "Solicitud enviada"... es un éxito; el resto,
// informativo. Quien quiera otro puede pasar el tipo explícito.
export function tipoDeAviso(titulo: string): TipoAviso {
  const t = titulo.trim().toLowerCase();
  if (/^(error|no se pudo|no pudimos|ups)/.test(t) || t.includes('error')) return 'error';
  if (/(listo|agregad|enviad|aceptad|guardad|eliminad|aprobad|actualizad|cread)/.test(t)) return 'exito';
  return 'info';
}

// Mensaje informativo (éxito, error o aviso). No bloquea: no hay que tocar
// ningún botón para seguir.
export function avisar(titulo: string, mensaje: string, tipo: TipoAviso = tipoDeAviso(titulo), icono?: string): void {
  if (host) {
    host.mostrarAviso({ titulo, mensaje, tipo, icono });
    return;
  }
  if (Platform.OS === 'web') {
    window.alert(`${titulo}\n\n${mensaje}`);
    return;
  }
  Alert.alert(titulo, mensaje);
}

// Cartelito de éxito con un botón (por ejemplo "Deshacer" después de
// borrar). Sin host (tests) se muestra como un aviso común, sin el botón.
export function avisarConAccion(titulo: string, mensaje: string, accion: AccionDeAviso): void {
  if (host) {
    host.mostrarAviso({ titulo, mensaje, tipo: 'exito', accion });
    return;
  }
  avisar(titulo, mensaje, 'exito');
}

// Confirmación sí/no. Devuelve una Promise (en vez de recibir un callback
// como Alert.alert) para poder hacer `await` en el caller, igual que con
// las llamadas a Supabase que suelen ir justo antes/después.
export function confirmar(titulo: string, mensaje: string, confirmLabel = 'Confirmar'): Promise<boolean> {
  if (host) {
    return host.pedirConfirmacion({ titulo, mensaje, confirmLabel });
  }
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

// Cola de cartelitos visibles: el nuevo va abajo de los anteriores y como
// mucho se ven `maximo` a la vez (si llegan muchos juntos, se descartan los
// más viejos en vez de tapar la pantalla). Lógica pura, usada por AvisosHost.
export interface AvisoEnPantalla extends Aviso {
  id: number;
}

export function agregarAviso(actuales: AvisoEnPantalla[], nuevo: AvisoEnPantalla, maximo = 3): AvisoEnPantalla[] {
  // Mismo título y mensaje que uno que ya se está viendo (por ejemplo, un
  // doble toque que falla dos veces): no se repite.
  if (actuales.some((a) => a.titulo === nuevo.titulo && a.mensaje === nuevo.mensaje)) return actuales;
  return [...actuales, nuevo].slice(-maximo);
}

// Cuánto tiempo queda visible un cartelito: los errores un poco más, para
// que se alcancen a leer.
// Con un botón ("Deshacer") queda más tiempo, para alcanzar a tocarlo.
export function duracionAviso(tipo: TipoAviso, conAccion = false): number {
  if (conAccion) return 7000;
  return tipo === 'error' ? 5000 : 3500;
}

// Si el botón de una confirmación es "peligroso" (borra o saca algo), se
// pinta en coral en vez de violeta.
export function esAccionDestructiva(confirmLabel: string): boolean {
  return /(eliminar|borrar|salir|expulsar|rechazar|deshabilitar|quitar|cancelar solicitud)/i.test(confirmLabel);
}
