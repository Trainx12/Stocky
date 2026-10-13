import type { ImageSourcePropType } from 'react-native';
import type { ProductoCatalogo } from '../types/database';
import { IMAGENES_LOCALES } from './catalogoImagenes.generado';

// Mismo criterio que scripts/generar-imagenes-catalogo.mjs y que los nombres de
// archivo de assets/catalogo: minúsculas, sin tildes, separado por guiones.
export function slugCatalogo(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// true si la foto la subieron a Stocky (la sugirió alguien o la cargó un
// admin desde Admin → Catálogo), no una dirección de otro sitio.
export function esFotoSubidaAStocky(url: string | null | undefined): boolean {
  return !!url && url.includes('/storage/v1/object/public/catalogo-sugerencias/');
}

// Foto de un producto del catálogo, en este orden:
//   1. la subida a Stocky (un admin la cambió a propósito, o vino con la
//      sugerencia): es la decisión más reciente;
//   2. la guardada en la app (assets/catalogo, no depende de ningún servidor);
//   3. cualquier otra URL de la base (casos viejos).
// null = sin foto, la pantalla muestra el ícono de canasta.
export function imagenDeCatalogo(item: Pick<ProductoCatalogo, 'nombre' | 'imagen_url'>): ImageSourcePropType | null {
  if (esFotoSubidaAStocky(item.imagen_url)) return { uri: item.imagen_url as string };
  const local = IMAGENES_LOCALES[slugCatalogo(item.nombre)];
  if (local) return local;
  return item.imagen_url ? { uri: item.imagen_url } : null;
}
