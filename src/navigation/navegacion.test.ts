/**
 * Tests de src/navigation/navegacion.ts: abrir la campanita desde fuera de
 * una pantalla (al tocar una notificación del sistema) solo si la
 * navegación ya está lista.
 */
// El ref se crea al importar navegacion.ts, antes que cualquier variable de
// este archivo: por eso vive dentro de la factory y se lee con requireMock
// (ver incidentes-sprint10.md, errores de proceso #2).
jest.mock('@react-navigation/native', () => {
  const ref = { isReady: jest.fn(), navigate: jest.fn() };
  return { ref, createNavigationContainerRef: () => ref };
});

import { irANotificaciones } from './navegacion';

const mockRef = (jest.requireMock('@react-navigation/native') as { ref: { isReady: jest.Mock; navigate: jest.Mock } }).ref;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('irANotificaciones', () => {
  it('navega a la campanita si la navegación está lista', () => {
    mockRef.isReady.mockReturnValue(true);
    irANotificaciones();
    expect(mockRef.navigate).toHaveBeenCalledWith('Notificaciones');
  });

  it('no hace nada si la app todavía está arrancando', () => {
    mockRef.isReady.mockReturnValue(false);
    irANotificaciones();
    expect(mockRef.navigate).not.toHaveBeenCalled();
  });
});
