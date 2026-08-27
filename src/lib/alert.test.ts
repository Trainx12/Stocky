/**
 * Tests de src/lib/alert.ts — el bug que corrige (Alert.alert es un no-op
 * en react-native-web) está documentado en docs/incidentes-sprint3.md.
 */
const mockAlert = jest.fn();

jest.mock('react-native', () => ({
  Alert: { alert: (...args: unknown[]) => mockAlert(...args) },
  Platform: { OS: 'ios' },
}));

import { Platform } from 'react-native';
import { avisar, confirmar } from './alert';

// react-native-web es quien resuelve `window` en el bundle real; en el
// entorno de test (react-native preset, no jsdom) no existe por default.
(globalThis as unknown as { window: { alert: jest.Mock; confirm: jest.Mock } }).window = {
  alert: jest.fn(),
  confirm: jest.fn(),
};

beforeEach(() => {
  mockAlert.mockReset();
  window.alert = jest.fn();
  window.confirm = jest.fn();
  (Platform as { OS: string }).OS = 'ios';
});

describe('avisar', () => {
  it('en nativo usa Alert.alert con un solo botón implícito', () => {
    avisar('Error', 'No se pudo salir del hogar.');

    expect(mockAlert).toHaveBeenCalledWith('Error', 'No se pudo salir del hogar.');
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('en web usa window.alert en vez de Alert.alert (que ahí es un no-op)', () => {
    (Platform as { OS: string }).OS = 'web';

    avisar('Error', 'No se pudo salir del hogar.');

    expect(window.alert).toHaveBeenCalledWith('Error\n\nNo se pudo salir del hogar.');
    expect(mockAlert).not.toHaveBeenCalled();
  });
});

describe('confirmar', () => {
  it('en nativo resuelve true cuando se toca el botón de confirmar', async () => {
    mockAlert.mockImplementation((_titulo, _mensaje, botones) => {
      botones[1].onPress();
    });

    await expect(confirmar('Salir del hogar', '¿Seguro?', 'Salir')).resolves.toBe(true);
  });

  it('en nativo resuelve false cuando se toca cancelar', async () => {
    mockAlert.mockImplementation((_titulo, _mensaje, botones) => {
      botones[0].onPress();
    });

    await expect(confirmar('Salir del hogar', '¿Seguro?', 'Salir')).resolves.toBe(false);
  });

  it('en web usa window.confirm (Alert.alert con botones no funciona ahí)', async () => {
    (Platform as { OS: string }).OS = 'web';
    (window.confirm as jest.Mock).mockReturnValue(true);

    await expect(confirmar('Salir del hogar', '¿Seguro?', 'Salir')).resolves.toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Salir del hogar\n\n¿Seguro?');
    expect(mockAlert).not.toHaveBeenCalled();
  });
});
