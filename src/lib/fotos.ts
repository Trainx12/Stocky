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

function esHeic(archivo: File): boolean {
  return /hei[cf]/i.test(archivo.type) || /\.hei[cf]$/i.test(archivo.name);
}

// Selector de archivo propio para web, en vez de ImagePicker: en web
// expo-image-picker carga la imagen en un <img> para medirla ANTES de
// devolverla, y los navegadores de escritorio no abren HEIC/HEIF (el formato
// de las fotos de iPhone), así que fallaba dentro de la librería sin dar
// chance de convertirla. Tiene que invocarse directo desde un toque del
// usuario (el navegador bloquea abrir el selector si no).
function elegirArchivoWeb(origen: OrigenFoto): Promise<File | null> {
  return new Promise((resolver) => {
    const entrada = document.createElement('input');
    entrada.type = 'file';
    entrada.accept = 'image/*,.heic,.heif';
    if (origen === 'camara') entrada.setAttribute('capture', 'environment');

    let resuelto = false;
    const alVolverElFoco = () => setTimeout(() => terminar(entrada.files?.[0] ?? null), 1000);
    const terminar = (archivo: File | null) => {
      if (resuelto) return;
      resuelto = true;
      window.removeEventListener('focus', alVolverElFoco);
      resolver(archivo);
    };
    // Navegadores sin evento "cancel": al volver el foco a la ventana, si no
    // llegó ningún archivo se considera cancelado.
    entrada.addEventListener('change', () => terminar(entrada.files?.[0] ?? null));
    entrada.addEventListener('cancel', () => terminar(null));
    window.addEventListener('focus', alVolverElFoco);
    entrada.click();
  });
}

// Devuelve una URI que el navegador puede abrir: el archivo tal cual o, si es
// HEIC, convertido a JPEG. heic2any se carga recién cuando hace falta (pesa
// bastante) y puede tardar unos segundos con fotos grandes.
async function uriLegibleWeb(archivo: File): Promise<string> {
  if (!esHeic(archivo)) return URL.createObjectURL(archivo);

  const { default: heic2any } = await import('heic2any');
  const convertido = await heic2any({ blob: archivo, toType: 'image/jpeg', quality: 0.8 });
  return URL.createObjectURL(Array.isArray(convertido) ? convertido[0] : convertido);
}

async function elegirUriNativa(origen: OrigenFoto): Promise<string | null> {
  if (origen === 'camara') {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      throw new Error('Necesitamos permiso para usar la cámara. Podés habilitarlo desde los ajustes del dispositivo.');
    }
  }

  const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const resultado =
    origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);

  return resultado.canceled || !resultado.assets[0] ? null : resultado.assets[0].uri;
}

// Saca o elige una foto y la devuelve en base64 (sin prefijo data:), lista
// para mandar a ocr-ticket / vencimiento-foto. null = el usuario canceló.
// Tira Error con mensaje legible si falta el permiso de cámara o la foto no
// se puede abrir.
export async function obtenerFotoBase64(origen: OrigenFoto): Promise<string | null> {
  let uri: string | null;
  if (Platform.OS === 'web') {
    const archivo = await elegirArchivoWeb(origen);
    if (!archivo) return null;
    try {
      uri = await uriLegibleWeb(archivo);
    } catch {
      throw new Error('No pudimos abrir esa foto (si es de iPhone, puede estar en formato HEIC). Probá con una foto JPG o PNG.');
    }
  } else {
    uri = await elegirUriNativa(origen);
  }
  if (!uri) return null;

  const contexto = ImageManipulator.manipulate(uri);
  contexto.resize({ width: ANCHO_MAXIMO });
  const imagen = await contexto.renderAsync();
  const guardada = await imagen.saveAsync({ format: SaveFormat.JPEG, compress: CALIDAD_JPEG, base64: true });

  return guardada.base64 ?? null;
}
