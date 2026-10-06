// Genera src/lib/catalogoImagenes.generado.ts a partir de los archivos de
// assets/catalogo/*.jpg. React Native/Metro exige que cada require() sea una
// cadena literal, así que el mapa nombre -> imagen no se puede armar en
// runtime: se genera acá. Correr después de agregar/cambiar fotos:
//   node scripts/generar-imagenes-catalogo.mjs
// También regenera assets/catalogo/CREDITOS.md a partir de assets/catalogo/creditos.json
// (fuente, autor, licencia y enlace de cada foto): esa es la fuente de verdad de los créditos.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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

// Créditos: creditos.json (producto -> { archivo, fuente, autor, licencia, url }) -> CREDITOS.md
const rutaCreditos = join(raiz, 'assets', 'catalogo', 'creditos.json');
if (existsSync(rutaCreditos)) {
  const creditos = JSON.parse(readFileSync(rutaCreditos, 'utf8'));
  const filas = Object.keys(creditos)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((nombre) => {
      const c = creditos[nombre];
      return `| ${nombre} | ${c.archivo} | ${c.fuente} | ${c.autor} | ${c.licencia} | ${c.url || '-'} |`;
    });
  const md = [
    '# Créditos de las fotos del catálogo',
    '',
    'Las fotos de `assets/catalogo/` se guardan en el repositorio para que la app no dependa de ningún sitio externo.',
    'Provienen de [Open Food Facts](https://world.openfoodfacts.org) (fotos de productos, licencia CC BY-SA 3.0), de',
    '[Wikimedia Commons](https://commons.wikimedia.org) (cada archivo con su licencia y autor) y de fotos aportadas por el equipo.',
    'Si se reutilizan fuera de la app hay que respetar esas licencias (atribución y, en los CC BY-SA, compartir igual).',
    '',
    'Esta tabla se genera con `node scripts/generar-imagenes-catalogo.mjs` a partir de `creditos.json`.',
    '',
    '| Producto | Archivo | Fuente | Autor | Licencia | Enlace |',
    '|---|---|---|---|---|---|',
    ...filas,
    '',
  ].join('\n');
  writeFileSync(join(raiz, 'assets', 'catalogo', 'CREDITOS.md'), md);
  console.log(`${filas.length} créditos en CREDITOS.md`);
}
