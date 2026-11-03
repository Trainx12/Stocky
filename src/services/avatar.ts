import { supabase } from '../lib/supabase';
import type { Usuario } from '../types/database';
import { base64ABytes } from './catalogo';

/**
 * Foto de perfil (pantalla Cuenta). Se guarda en el bucket público
 * "avatares", en la carpeta del usuario (<uid>/<fecha>.jpg), y su URL pública
 * en usuarios.avatar_url (ver migración 20261019120000_foto_de_perfil.sql).
 * Cada cambio sube un archivo con nombre nuevo, así nadie ve la foto vieja
 * por caché, y después se borra la anterior.
 */

export const BUCKET_AVATARES = 'avatares';

// Ancho al que se achica la foto antes de subirla (ver lib/fotos.ts): en la
// app se ve como mucho a 72 px, así que 400 sobra y pesa poco.
export const ANCHO_AVATAR = 400;

// Ruta dentro del bucket a partir de la URL pública, o null si la URL no es
// una foto de perfil de ESE usuario (así nunca se intenta borrar algo ajeno).
export function rutaDeAvatar(url: string | null | undefined, userId: string): string | null {
  const marca = `/storage/v1/object/public/${BUCKET_AVATARES}/`;
  const posicion = url?.indexOf(marca) ?? -1;
  if (!url || posicion < 0) return null;
  const ruta = decodeURIComponent(url.slice(posicion + marca.length).split('?')[0]);
  return ruta.startsWith(`${userId}/`) ? ruta : null;
}

// Sube la foto nueva, la deja como foto de perfil y borra la anterior.
// Devuelve la URL nueva.
export async function cambiarMiAvatar(usuario: Pick<Usuario, 'id' | 'avatar_url'>, fotoBase64: string): Promise<string> {
  const ruta = `${usuario.id}/${Date.now()}.jpg`;
  const { error: errorSubida } = await supabase.storage
    .from(BUCKET_AVATARES)
    .upload(ruta, base64ABytes(fotoBase64), { contentType: 'image/jpeg' });
  if (errorSubida) throw new Error(`No se pudo subir la foto: ${errorSubida.message}`);

  const url = supabase.storage.from(BUCKET_AVATARES).getPublicUrl(ruta).data.publicUrl;
  const { error } = await supabase.from('usuarios').update({ avatar_url: url }).eq('id', usuario.id);
  if (error) {
    // No quedó vinculada: no dejar la foto suelta en el bucket.
    await supabase.storage.from(BUCKET_AVATARES).remove([ruta]);
    throw error;
  }
  await borrarAvatarViejo(usuario.avatar_url, usuario.id);
  return url;
}

// Saca la foto: vuelve a verse la inicial del nombre.
export async function quitarMiAvatar(usuario: Pick<Usuario, 'id' | 'avatar_url'>): Promise<void> {
  const { error } = await supabase.from('usuarios').update({ avatar_url: null }).eq('id', usuario.id);
  if (error) throw error;
  await borrarAvatarViejo(usuario.avatar_url, usuario.id);
}

// Borra TODOS los archivos de la carpeta del usuario (foto actual y
// cualquiera que haya quedado suelta). Lo usa "Borrar mi cuenta" antes de
// borrar el usuario: Supabase no deja borrar archivos de Storage desde SQL.
export async function borrarMisFotosDePerfil(userId: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET_AVATARES).list(userId);
  if (error) throw new Error(`No se pudo borrar tu foto de perfil: ${error.message}`);
  const rutas = (data ?? []).map((archivo) => `${userId}/${archivo.name}`);
  if (rutas.length === 0) return;
  const { error: errorBorrado } = await supabase.storage.from(BUCKET_AVATARES).remove(rutas);
  if (errorBorrado) throw new Error(`No se pudo borrar tu foto de perfil: ${errorBorrado.message}`);
}

// Si no se puede borrar el archivo viejo no pasa nada grave (queda suelto en
// la carpeta del usuario y se limpia al borrar la cuenta): el cambio ya se guardó.
async function borrarAvatarViejo(url: string | null | undefined, userId: string): Promise<void> {
  const ruta = rutaDeAvatar(url, userId);
  if (ruta) await supabase.storage.from(BUCKET_AVATARES).remove([ruta]);
}
