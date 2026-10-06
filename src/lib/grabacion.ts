import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import { File } from 'expo-file-system';
import type { AudioGrabado } from '../services/externalApis';

// Un comando de voz es una frase corta: pasado este tiempo se corta solo
// (así un toque olvidado no graba minutos de audio que después hay que subir).
export const SEGUNDOS_MAXIMOS = 30;

// Voz mono a 16 kHz alcanza y sobra para que Gemini entienda lo dicho, y deja
// archivos chicos (30 s ≈ 120 KB en Android, ≈ 1 MB en iOS). Se eligen
// formatos que Gemini acepta: AAC en Android, WAV en iOS y WebM/MP4 (lo que
// soporte el navegador) en web.
const OPCIONES: RecordingOptions = {
  extension: '.aac',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 32000,
  android: {
    extension: '.aac',
    outputFormat: 'aac_adts',
    audioEncoder: 'aac',
  },
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.MEDIUM,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: {
    mimeType: 'audio/webm',
    bitsPerSecond: 32000,
  },
};

const MIME_NATIVO = Platform.OS === 'ios' ? 'audio/wav' : 'audio/aac';

// En web la grabación queda en un blob: URL; se lee y se pasa a base64.
async function leerAudioWeb(uri: string): Promise<AudioGrabado> {
  const blob = await (await fetch(uri)).blob();
  const dataUrl = await new Promise<string>((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onloadend = () => resolver(String(lector.result));
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(blob);
  });
  URL.revokeObjectURL(uri);
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: blob.type.split(';')[0] || 'audio/webm' };
}

async function leerAudio(uri: string): Promise<AudioGrabado> {
  if (Platform.OS === 'web') return leerAudioWeb(uri);
  const archivo = new File(uri);
  const base64 = await archivo.base64();
  try {
    archivo.delete();
  } catch {
    // Es un archivo temporal en caché: si no se puede borrar, lo limpia el sistema.
  }
  return { base64, mimeType: MIME_NATIVO };
}

/**
 * Grabador de un mensaje de voz corto: tocar para empezar, tocar para
 * terminar. Al terminar (a mano o al llegar a SEGUNDOS_MAXIMOS) llama a
 * `alTerminar` con el audio en base64 listo para mandar a voz-a-texto.
 * Lo usan ComandoVozModal (ABM por voz) y ProductoFormModal (fecha dictada).
 */
export function useGrabadorDeVoz(alTerminar: (audio: AudioGrabado) => void, alFallar: (mensaje: string) => void) {
  const grabador = useAudioRecorder(OPCIONES);
  const estado = useAudioRecorderState(grabador, 250);
  const [grabando, setGrabando] = useState(false);
  // Evita que el corte automático y un toque en "Detener" procesen el mismo
  // audio dos veces.
  const deteniendo = useRef(false);
  const descartar = useRef(false);

  const iniciar = useCallback(async () => {
    try {
      const permiso = await requestRecordingPermissionsAsync();
      if (!permiso.granted) {
        alFallar('Necesitamos permiso para usar el micrófono. Podés habilitarlo desde los ajustes del dispositivo o del navegador.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await grabador.prepareToRecordAsync();
      grabador.record();
      deteniendo.current = false;
      descartar.current = false;
      setGrabando(true);
    } catch (err) {
      alFallar(err instanceof Error && err.message ? `No se pudo empezar a grabar: ${err.message}` : 'No se pudo empezar a grabar.');
    }
  }, [grabador, alFallar]);

  const detener = useCallback(async () => {
    if (deteniendo.current) return;
    deteniendo.current = true;
    setGrabando(false);
    try {
      await grabador.stop();
      // En iOS la sesión de audio queda en modo grabación (baja el volumen de
      // todo lo demás) si no se vuelve a apagar.
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (descartar.current) return;
      const uri = grabador.uri;
      if (!uri) throw new Error('No quedó ninguna grabación.');
      alTerminar(await leerAudio(uri));
    } catch (err) {
      if (!descartar.current) alFallar(err instanceof Error ? err.message : 'No se pudo leer la grabación.');
    }
  }, [grabador, alTerminar, alFallar]);

  // Corta sin procesar (por ejemplo, si se cierra el modal a mitad).
  const cancelar = useCallback(async () => {
    if (!grabando) return;
    descartar.current = true;
    await detener();
  }, [grabando, detener]);

  const segundos = Math.floor((estado.durationMillis ?? 0) / 1000);

  useEffect(() => {
    if (grabando && segundos >= SEGUNDOS_MAXIMOS) detener();
  }, [grabando, segundos, detener]);

  return { grabando, segundos: grabando ? segundos : 0, iniciar, detener, cancelar };
}
