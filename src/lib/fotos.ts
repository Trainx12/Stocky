import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type OrigenFoto = 'camara' | 'galeria';

// OCR.space (free) rechaza archivos de más de 1 MB: una foto de celular sin
// tocar lo supera de sobra. Se achica y se recomprime a JPEG antes de
// mandarla (también deja siempre el mismo mime que esperan las Edge
// Functions, sin importar el formato original de la galería).
const ANCHO_MAXIMO = 1400;
const CALIDAD_JPEG = 0.6;

// Saca o elige una foto y la devuelve en base64 (sin prefijo data:), lista
// para mandar a ocr-ticket / vencimiento-foto. null = el usuario canceló.
// Tira Error con mensaje legible si falta el permiso de cámara.
export async function obtenerFotoBase64(origen: OrigenFoto): Promise<string | null> {
  if (origen === 'camara') {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      throw new Error('Necesitamos permiso para usar la cámara. Podés habilitarlo desde los ajustes del dispositivo.');
    }
  }

  const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const resultado =
    origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);

  if (resultado.canceled || !resultado.assets[0]) return null;

  const contexto = ImageManipulator.manipulate(resultado.assets[0].uri);
  contexto.resize({ width: ANCHO_MAXIMO });
  const imagen = await contexto.renderAsync();
  const guardada = await imagen.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_JPEG, base64: true });

  return guardada.base64 ?? null;
}
