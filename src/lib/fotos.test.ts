jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: { JPEG: 'jpeg' } }));

import { esHeic } from './fotos';

/**
 * Los navegadores de escritorio no abren HEIC (fotos de iPhone), y expo-image-picker
 * fallaba en web antes de dejar convertirlas: por eso se detecta el formato a mano.
 * Windows a veces entrega un File con `type` vacío, así que la extensión también cuenta.
 */
describe('esHeic', () => {
  it('detecta HEIC/HEIF por el tipo MIME', () => {
    expect(esHeic({ type: 'image/heic', name: 'foto' })).toBe(true);
    expect(esHeic({ type: 'image/heif', name: 'foto' })).toBe(true);
    expect(esHeic({ type: 'image/HEIC', name: 'foto' })).toBe(true);
  });

  it('detecta HEIC/HEIF por la extensión cuando el navegador no informa el tipo', () => {
    expect(esHeic({ type: '', name: 'IMG_4887.HEIC' })).toBe(true);
    expect(esHeic({ type: '', name: 'foto.heif' })).toBe(true);
  });

  it('no marca como HEIC a los formatos que el navegador sí abre', () => {
    expect(esHeic({ type: 'image/jpeg', name: 'foto.jpg' })).toBe(false);
    expect(esHeic({ type: 'image/png', name: 'foto.png' })).toBe(false);
    expect(esHeic({ type: '', name: 'ticket.webp' })).toBe(false);
  });

  it('no se confunde con nombres que solo contienen "heic" en el medio', () => {
    expect(esHeic({ type: 'image/jpeg', name: 'heic-prueba.jpg' })).toBe(false);
  });
});
