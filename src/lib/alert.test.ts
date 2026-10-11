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
import {
  agregarAviso,
  avisar,
  confirmar,
  duracionAviso,
  esAccionDestructiva,
  registrarHostDeAvisos,
  tipoDeAviso,
} from './alert';
import type { AvisoEnPantalla } from './alert';

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

// Sprint 10: con el AvisosHost montado, avisar()/confirmar() usan el diseño
// de la app en vez de los diálogos del navegador/sistema.
describe('con un host de avisos registrado', () => {
  it('avisar() muestra un cartelito con el tipo deducido del título, sin diálogos', () => {
    const mostrarAviso = jest.fn();
    const quitar = registrarHostDeAvisos({ mostrarAviso, pedirConfirmacion: jest.fn() });

    avisar('Error', 'No se pudo salir del hogar.');
    avisar('Productos agregados', 'Se agregaron 2 productos.');
    avisar('Stock bajo: Leche', 'Quedan 1 l.', 'info', 'trending-down-outline');
    quitar();

    expect(mostrarAviso.mock.calls.map((c) => [c[0].titulo, c[0].tipo, c[0].icono])).toEqual([
      ['Error', 'error', undefined],
      ['Productos agregados', 'exito', undefined],
      ['Stock bajo: Leche', 'info', 'trending-down-outline'],
    ]);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('confirmar() delega en el diálogo propio y devuelve su respuesta', async () => {
    const pedirConfirmacion = jest.fn().mockResolvedValue(true);
    const quitar = registrarHostDeAvisos({ mostrarAviso: jest.fn(), pedirConfirmacion });

    await expect(confirmar('Eliminar producto', '¿Seguro?', 'Eliminar')).resolves.toBe(true);
    quitar();

    expect(pedirConfirmacion).toHaveBeenCalledWith({ titulo: 'Eliminar producto', mensaje: '¿Seguro?', confirmLabel: 'Eliminar' });
    expect(mockAlert).not.toHaveBeenCalled();
  });

  it('al desregistrarse vuelve al comportamiento anterior', () => {
    const mostrarAviso = jest.fn();
    registrarHostDeAvisos({ mostrarAviso, pedirConfirmacion: jest.fn() })();

    avisar('Error', 'x');

    expect(mostrarAviso).not.toHaveBeenCalled();
    expect(mockAlert).toHaveBeenCalledWith('Error', 'x');
  });

  it('un host viejo no desregistra al nuevo', () => {
    const viejo = jest.fn();
    const nuevo = jest.fn();
    const quitarViejo = registrarHostDeAvisos({ mostrarAviso: viejo, pedirConfirmacion: jest.fn() });
    const quitarNuevo = registrarHostDeAvisos({ mostrarAviso: nuevo, pedirConfirmacion: jest.fn() });
    quitarViejo();

    avisar('Listo', 'ok');
    quitarNuevo();

    expect(nuevo).toHaveBeenCalledTimes(1);
    expect(viejo).not.toHaveBeenCalled();
  });
});

describe('tipoDeAviso', () => {
  it.each([
    ['Error', 'error'],
    ['No se pudo iniciar sesión', 'error'],
    ['No pudimos leer la fecha', 'error'],
    ['Listo', 'exito'],
    ['Productos agregados', 'exito'],
    ['Solicitud enviada', 'exito'],
    ['Invitación enviada', 'exito'],
    ['Próximamente', 'info'],
    ['Todavía no tenés un hogar', 'info'],
  ])('"%s" -> %s', (titulo, tipo) => {
    expect(tipoDeAviso(titulo)).toBe(tipo);
  });
});

describe('agregarAviso', () => {
  const aviso = (id: number, titulo = `t${id}`): AvisoEnPantalla => ({ id, titulo, mensaje: 'm', tipo: 'info' });

  it('agrega al final y deja como mucho `maximo`, descartando los más viejos', () => {
    const lista = [aviso(1), aviso(2), aviso(3)];
    expect(agregarAviso(lista, aviso(4)).map((a) => a.id)).toEqual([2, 3, 4]);
  });

  it('no repite un aviso idéntico que ya se está viendo', () => {
    const lista = [aviso(1, 'Error')];
    expect(agregarAviso(lista, aviso(2, 'Error'))).toBe(lista);
  });
});

describe('duracionAviso / esAccionDestructiva', () => {
  it('los errores quedan más tiempo a la vista', () => {
    expect(duracionAviso('error')).toBeGreaterThan(duracionAviso('exito'));
  });

  it('detecta los botones que borran o sacan algo', () => {
    expect(esAccionDestructiva('Eliminar')).toBe(true);
    expect(esAccionDestructiva('Salir')).toBe(true);
    expect(esAccionDestructiva('Deshabilitar')).toBe(true);
    expect(esAccionDestructiva('Confirmar')).toBe(false);
  });
});
