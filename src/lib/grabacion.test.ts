/**
 * Tests de la parte pura de src/lib/grabacion.ts: el medidor de volumen de
 * "Cargar por voz" y el aviso de voz baja.
 */
jest.mock('expo-audio', () => ({
  AudioQuality: { MEDIUM: 64 },
  IOSOutputFormat: { LINEARPCM: 'lpcm' },
  requestRecordingPermissionsAsync: jest.fn(),
  setAudioModeAsync: jest.fn(),
  useAudioRecorder: jest.fn(),
  useAudioRecorderState: jest.fn(),
}));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

import { nivelDeVolumen, vozMuyBaja } from './grabacion';

describe('nivelDeVolumen', () => {
  it('pasa los decibeles del micrófono a 0..1', () => {
    expect(nivelDeVolumen(0)).toBe(1);
    expect(nivelDeVolumen(-30)).toBe(0.5);
    expect(nivelDeVolumen(-60)).toBe(0);
    expect(nivelDeVolumen(-160)).toBe(0);
    expect(nivelDeVolumen(5)).toBe(1);
  });

  it('sin dato del dispositivo devuelve null (no se dibuja el medidor)', () => {
    expect(nivelDeVolumen(undefined)).toBeNull();
    expect(nivelDeVolumen(null)).toBeNull();
    expect(nivelDeVolumen(Number.NaN)).toBeNull();
  });
});

describe('vozMuyBaja', () => {
  it('avisa solo después de unos segundos si la voz nunca llegó a un nivel normal', () => {
    expect(vozMuyBaja(0.1, 1)).toBe(false); // recién empieza
    expect(vozMuyBaja(0.1, 3)).toBe(true);
    expect(vozMuyBaja(0.6, 10)).toBe(false); // habló fuerte en algún momento
  });

  it('sin datos de volumen no avisa nada', () => {
    expect(vozMuyBaja(null, 10)).toBe(false);
  });
});
