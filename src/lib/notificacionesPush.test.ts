/**
 * Tests de src/lib/notificacionesPush.ts. Se mockean los módulos nativos
 * (expo-notifications, expo-device, expo-constants) y Supabase: se verifica
 * la lógica propia (cuándo pedir permiso, qué se guarda, qué se programa y
 * que nunca rompa la app si algo falla), no el sistema operativo.
 */
const mockRpc = jest.fn();

// Jest sube los jest.mock() arriba de todo, antes de que existan las
// variables del archivo (ver incidentes-sprint8.md, errores de proceso #3):
// por eso los mocks de los módulos nativos se definen DENTRO de la factory
// y los tests los leen con jest.requireMock (más abajo).
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getExpoPushTokenAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn().mockResolvedValue(undefined),
  scheduleNotificationAsync: jest.fn().mockResolvedValue('id'),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));
// Getter: `import * as Device` copia las propiedades al importar, y un valor
// plano quedaría congelado; un getter se sigue leyendo en cada uso.
jest.mock('expo-device', () => {
  const estado = { isDevice: true };
  return {
    estado,
    get isDevice() {
      return estado.isDevice;
    },
  };
});
jest.mock('expo-constants', () => ({ expoConfig: { extra: { eas: { projectId: 'proyecto-1' } } } }));

jest.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

import {
  configurarNotificaciones,
  desregistrarPush,
  pedirPermiso,
  programarAvisosLocales,
  registrarPush,
} from './notificacionesPush';
import type { Producto } from '../types/database';
import { Platform } from 'react-native';

// Se usa el Platform real de jest-expo y solo se cambia el sistema operativo
// por test (mockear todo react-native rompe el setup del preset).
const mockPlatform = Platform as { OS: string };
const mockNotifications = jest.requireMock('expo-notifications') as Record<string, jest.Mock>;
const mockDevice = (jest.requireMock('expo-device') as { estado: { isDevice: boolean } }).estado;

beforeEach(() => {
  jest.clearAllMocks();
  mockPlatform.OS = 'android';
  mockDevice.isDevice = true;
  mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
  mockRpc.mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('configurarNotificaciones', () => {
  it('con la app abierta no muestra el banner del sistema (ya hay cartelito propio) y crea el canal de Android', async () => {
    await configurarNotificaciones();

    const handler = mockNotifications.setNotificationHandler.mock.calls[0][0];
    await expect(handler.handleNotification()).resolves.toMatchObject({ shouldShowBanner: false, shouldShowList: true });
    expect(mockNotifications.setNotificationChannelAsync).toHaveBeenCalledWith('default', expect.objectContaining({ importance: 4 }));
  });

  it('en web no hace nada', async () => {
    mockPlatform.OS = 'web';
    await configurarNotificaciones();
    expect(mockNotifications.setNotificationHandler).not.toHaveBeenCalled();
  });
});

describe('pedirPermiso', () => {
  it('no vuelve a preguntar si ya está concedido', async () => {
    await expect(pedirPermiso()).resolves.toBe(true);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('pregunta si todavía se puede, y devuelve la respuesta', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    mockNotifications.requestPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(pedirPermiso()).resolves.toBe(false);
    expect(mockNotifications.requestPermissionsAsync).toHaveBeenCalled();
  });

  it('si el usuario ya lo negó para siempre, no insiste', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(pedirPermiso()).resolves.toBe(false);
    expect(mockNotifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('registrarPush', () => {
  it('pide el token con el projectId de EAS y lo guarda por RPC', async () => {
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });

    await expect(registrarPush()).resolves.toBe('ExponentPushToken[abc]');

    expect(mockNotifications.getExpoPushTokenAsync).toHaveBeenCalledWith({ projectId: 'proyecto-1' });
    expect(mockRpc).toHaveBeenCalledWith('registrar_push_token', { p_token: 'ExponentPushToken[abc]', p_plataforma: 'android' });
  });

  it('devuelve null (sin romper) si falta configurar Firebase', async () => {
    mockNotifications.getExpoPushTokenAsync.mockRejectedValue(new Error('Default FirebaseApp is not initialized'));
    await expect(registrarPush()).resolves.toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('devuelve null si no hay permiso, en un emulador o en web', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: false });
    await expect(registrarPush()).resolves.toBeNull();

    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: true, canAskAgain: true });
    mockDevice.isDevice = false;
    await expect(registrarPush()).resolves.toBeNull();

    mockDevice.isDevice = true;
    mockPlatform.OS = 'web';
    await expect(registrarPush()).resolves.toBeNull();
    expect(mockNotifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  });

  it('devuelve null si la base rechaza el token', async () => {
    mockNotifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[abc]' });
    mockRpc.mockResolvedValue({ error: new Error('Token de notificaciones inválido') });
    await expect(registrarPush()).resolves.toBeNull();
  });
});

describe('desregistrarPush', () => {
  it('borra el token por RPC, y no hace nada sin token', async () => {
    await desregistrarPush(null);
    expect(mockRpc).not.toHaveBeenCalled();

    await desregistrarPush('ExponentPushToken[abc]');
    expect(mockRpc).toHaveBeenCalledWith('eliminar_push_token', { p_token: 'ExponentPushToken[abc]' });
  });
});

describe('programarAvisosLocales', () => {
  // Vence dentro de un año: el aviso queda siempre en el futuro.
  const enUnAnio = new Date();
  enUnAnio.setFullYear(enUnAnio.getFullYear() + 1);
  const fecha = `${enUnAnio.getFullYear()}-${String(enUnAnio.getMonth() + 1).padStart(2, '0')}-${String(enUnAnio.getDate()).padStart(2, '0')}`;
  const producto = {
    id: 'p1',
    nombre: 'Arroz',
    marca: null,
    cantidad: 1,
    fecha_vencimiento: fecha,
    alerta_vencimiento_habilitada: true,
    dias_aviso_vencimiento: null,
  } as unknown as Producto;

  it('borra los avisos anteriores y programa uno por producto con fecha', async () => {
    await expect(programarAvisosLocales([producto], 7)).resolves.toBe(1);

    expect(mockNotifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
    expect(mockNotifications.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: `vence-p1-${fecha}`,
        content: expect.objectContaining({ title: 'Por vencer: Arroz' }),
        trigger: expect.objectContaining({ type: 'date', channelId: 'default' }),
      }),
    );
  });

  it('sin permiso solo limpia (no programa nada)', async () => {
    mockNotifications.getPermissionsAsync.mockResolvedValue({ granted: false, canAskAgain: true });
    await expect(programarAvisosLocales([producto], 7)).resolves.toBe(0);
    expect(mockNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});
