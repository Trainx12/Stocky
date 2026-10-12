import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Si la cuenta ya respondió el "¿Querés que te mostremos cómo se usa?" del
 * tutorial (src/tutorial/tutorial.ts). Se guarda en el dispositivo, por
 * cuenta, como las demás preferencias locales (services/preferenciasHogar.ts):
 * en otro dispositivo se vuelve a preguntar una vez, que es razonable para
 * alguien que recién lo instala ahí.
 *
 *   - null: nunca se le preguntó → se muestra la pregunta al entrar.
 *   - 'hecho': terminó el tutorial.
 *   - 'saltado': dijo que ya sabe usarla, o lo cerró a la mitad.
 *
 * En los dos últimos casos no se vuelve a preguntar; el tutorial se puede
 * repetir a mano desde Cuenta o desde la Ayuda.
 */
export type RespuestaTutorial = 'hecho' | 'saltado';

const clave = (usuarioId: string) => `stocky.tutorial.${usuarioId}`;

export async function leerRespuestaTutorial(usuarioId: string): Promise<RespuestaTutorial | null> {
  try {
    const valor = await AsyncStorage.getItem(clave(usuarioId));
    return valor === 'hecho' || valor === 'saltado' ? valor : null;
  } catch {
    // Sin almacenamiento (modo privado del navegador): mejor no insistir
    // con la pregunta en cada apertura.
    return 'saltado';
  }
}

export async function guardarRespuestaTutorial(usuarioId: string, respuesta: RespuestaTutorial): Promise<void> {
  try {
    await AsyncStorage.setItem(clave(usuarioId), respuesta);
  } catch (err) {
    console.warn('[Stocky] No se pudo guardar la respuesta del tutorial:', err);
  }
}
