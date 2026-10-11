/// <reference types="node" />
// (El tsconfig del proyecto solo carga los tipos de jest; este test lee assets/ con node:fs.)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { imagenDeCatalogo, slugCatalogo } from './catalogoImagenes';
import { IMAGENES_LOCALES } from './catalogoImagenes.generado';

describe('slugCatalogo', () => {
  it('pasa a minúsculas, sin tildes ni símbolos, separado por guiones', () => {
    expect(slugCatalogo('Pan Francés')).toBe('pan-frances');
    expect(slugCatalogo('Ñoquis Secos')).toBe('noquis-secos');
    expect(slugCatalogo('  Té   Verde ')).toBe('te-verde');
  });
});

describe('imagenDeCatalogo', () => {
  it('prefiere la foto guardada en la app aunque la base tenga una URL externa', () => {
    const foto = imagenDeCatalogo({ nombre: 'Agua Mineral', imagen_url: 'https://externo.example/agua.jpg' });

    expect(foto).not.toBeNull();
    expect(foto).not.toEqual({ uri: 'https://externo.example/agua.jpg' });
  });

  it('usa la URL de la base si no hay foto guardada (producto aprobado después)', () => {
    expect(imagenDeCatalogo({ nombre: 'Producto Inexistente 123', imagen_url: 'https://externo.example/x.jpg' })).toEqual({
      uri: 'https://externo.example/x.jpg',
    });
  });

  it('devuelve null si no hay ninguna', () => {
    expect(imagenDeCatalogo({ nombre: 'Producto Inexistente 123', imagen_url: null })).toBeNull();
  });
});

/**
 * Consistencia de assets/catalogo: las fotos están en el repo (no dependen de
 * ningún sitio externo), el mapa que usa la app se genera con
 * scripts/generar-imagenes-catalogo.mjs y creditos.json es la fuente de
 * verdad de las licencias. Si alguien agrega una foto y olvida regenerar el
 * mapa o cargar su crédito, estos tests lo avisan.
 */
describe('assets/catalogo', () => {
  const carpeta = join(__dirname, '..', '..', 'assets', 'catalogo');
  const archivos = readdirSync(carpeta).filter((nombre) => /\.(jpe?g|png|webp)$/i.test(nombre));
  const creditos: Record<string, { archivo: string; fuente: string; autor: string; licencia: string; url: string }> = JSON.parse(
    readFileSync(join(carpeta, 'creditos.json'), 'utf8'),
  );

  it('el mapa generado tiene exactamente una entrada por foto (regenerar con scripts/generar-imagenes-catalogo.mjs)', () => {
    const clavesDeArchivos = archivos.map((nombre) => nombre.replace(/\.[^.]+$/, '')).sort();

    expect(Object.keys(IMAGENES_LOCALES).sort()).toEqual(clavesDeArchivos);
  });

  it('cada foto tiene su crédito en creditos.json y cada crédito apunta a una foto que existe', () => {
    const archivosConCredito = Object.values(creditos).map((c) => c.archivo).sort();

    expect(archivosConCredito).toEqual([...archivos].sort());
    for (const { archivo } of Object.values(creditos)) {
      expect(existsSync(join(carpeta, archivo))).toBe(true);
    }
  });

  it('el nombre del archivo es el slug del producto (así la app lo encuentra)', () => {
    for (const [producto, { archivo }] of Object.entries(creditos)) {
      expect(`${slugCatalogo(producto)}.jpg`).toBe(archivo);
    }
  });

  it('todos los créditos informan fuente y licencia, y ninguna licencia es "no comercial"', () => {
    for (const [producto, c] of Object.entries(creditos)) {
      expect({ producto, fuente: c.fuente.trim() }).not.toEqual({ producto, fuente: '' });
      expect({ producto, licencia: c.licencia.trim() }).not.toEqual({ producto, licencia: '' });
      expect(c.licencia).not.toMatch(/NC/);
    }
  });

  it('CREDITOS.md lista todos los productos (se regenera junto con el mapa)', () => {
    const md = readFileSync(join(carpeta, 'CREDITOS.md'), 'utf8');

    for (const producto of Object.keys(creditos)) {
      expect(md).toContain(`| ${producto} |`);
    }
  });
});
