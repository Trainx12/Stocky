import { imagenDeCatalogo, slugCatalogo } from './catalogoImagenes';

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
