// Genera src/lib/catalogoImagenes.generado.ts a partir de los archivos de
// assets/catalogo/*.jpg. React Native/Metro exige que cada require() sea una
// cadena literal, así que el mapa nombre -> imagen no se puede armar en
// runtime: se genera acá. Correr después de agregar/cambiar fotos:
//   node scripts/generar-imagenes-catalogo.mjs
import { readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const archivos = readdirSync(join(raiz, 'assets', 'catalogo'))
  .filter((nombre) => /\.(jpe?g|png|webp)$/i.test(nombre))
  .sort();

const lineas = archivos.map((nombre) => `  '${nombre.replace(/\.[^.]+$/, '')}': require('../../assets/catalogo/${nombre}'),`);

const contenido = `// ARCHIVO GENERADO por scripts/generar-imagenes-catalogo.mjs -- no editar a mano.
// Fotos del catálogo guardadas en el repo (assets/catalogo) para no depender de
// ningún sitio externo. La clave es el nombre del producto en minúsculas, sin
// tildes y con guiones (ver slugCatalogo en catalogoImagenes.ts).
import type { ImageSourcePropType } from 'react-native';

export const IMAGENES_LOCALES: Record<string, ImageSourcePropType> = {
${lineas.join('\n')}
};
`;

writeFileSync(join(raiz, 'src', 'lib', 'catalogoImagenes.generado.ts'), contenido);
console.log(`${archivos.length} imágenes en el mapa`);
