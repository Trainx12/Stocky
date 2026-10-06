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

// Foto de un producto del catálogo: primero la guardada en la app (no depende
// de ningún servidor externo) y, solo si no hay, la URL de la base (por ejemplo
// un producto sugerido y aprobado después de armar esta versión). null = sin
// foto, la pantalla muestra el ícono de canasta.
export function imagenDeCatalogo(item: Pick<ProductoCatalogo, 'nombre' | 'imagen_url'>): ImageSourcePropType | null {
  const local = IMAGENES_LOCALES[slugCatalogo(item.nombre)];
  if (local) return local;
  return item.imagen_url ? { uri: item.imagen_url } : null;
}
