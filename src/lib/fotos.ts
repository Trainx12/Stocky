import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export type OrigenFoto = 'camara' | 'galeria';

// OCR.space (free) rechaza archivos de más de 1 MB: una foto de celular sin
// tocar lo supera de sobra. Se achica y se recomprime a JPEG antes de
// mandarla (también deja siempre el mismo mime que esperan las Edge
// Functions, sin importar el formato original de la galería).
const ANCHO_MAXIMO = 1400;
const CALIDAD_JPEG = 0.6;

function esHeic(tipo: string | null | undefined, nombre: string | null | undefined): boolean {
  return /hei[cf]/i.test(tipo ?? '') || /\.hei[cf]$/i.test(nombre ?? '');
}

// Los navegadores de escritorio no abren HEIC/HEIF (el formato de las fotos de
// iPhone): sin convertirlo, el procesado de abajo falla. Solo hace falta en
// web; en iOS/Android el selector ya entrega una imagen que el sistema abre.
// heic2any se carga recién cuando hace falta (pesa bastante).
async function uriLegible(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (Platform.OS !== 'web') return asset.uri;

  const blob = await (await fetch(asset.uri)).blob();
  if (!esHeic(asset.mimeType ?? blob.type, asset.fileName)) return asset.uri;

  const { default: heic2any } = await import('heic2any');
  const convertido = await heic2any({ blob, toType: 'image/jpeg', quality: 0.8 });
  return URL.createObjectURL(Array.isArray(convertido) ? convertido[0] : convertido);
}

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

  let uri: string;
  try {
    uri = await uriLegible(resultado.assets[0]);
  } catch {
    throw new Error('No pudimos abrir esa foto (si es de iPhone, puede estar en formato HEIC). Probá con una foto JPG o PNG, o sacala con la cámara.');
  }

  const contexto = ImageManipulator.manipulate(uri);
  contexto.resize({ width: ANCHO_MAXIMO });
  const imagen = await contexto.renderAsync();
  const guardada = await imagen.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_JPEG, base64: true });

  return guardada.base64 ?? null;
}
