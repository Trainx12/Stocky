/**
 * Tests de src/services/terminos.ts (aceptación de los Términos y
 * Condiciones). Se mockean Supabase y AsyncStorage: se prueba cuándo hay que
 * pedir la aceptación y cómo se registra una aceptación hecha antes del
 * login.
 */
const mockRpc = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  aceptarTerminos,
  guardarAceptacionLocal,
  necesitaAceptarTerminos,
  registrarAceptacionPendiente,
} from './terminos';
import { VERSION_TERMINOS } from '../legal/terminos';

const almacen = AsyncStorage as unknown as Record<'getItem' | 'setItem' | 'removeItem', jest.Mock>;

beforeEach(() => {
  jest.clearAllMocks();
  mockRpc.mockResolvedValue({ error: null });
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('necesitaAceptarTerminos', () => {
  it('pide aceptar si nunca aceptó o aceptó otra versión', () => {
    expect(necesitaAceptarTerminos({ terminos_version: null }, '2026-10-11')).toBe(true);
    expect(necesitaAceptarTerminos({ terminos_version: '2026-01-01' }, '2026-10-11')).toBe(true);
  });

  it('no pide nada si ya aceptó la vigente, o si el perfil todavía no cargó', () => {
    expect(necesitaAceptarTerminos({ terminos_version: '2026-10-11' }, '2026-10-11')).toBe(false);
    expect(necesitaAceptarTerminos(null)).toBe(false);
  });
});

describe('aceptarTerminos', () => {
  it('registra la versión vigente por RPC', async () => {
    await aceptarTerminos();
    expect(mockRpc).toHaveBeenCalledWith('aceptar_terminos', { p_version: VERSION_TERMINOS });
  });

  it('propaga el error', async () => {
    mockRpc.mockResolvedValue({ error: new Error('sin red') });
    await expect(aceptarTerminos()).rejects.toThrow('sin red');
  });
});

describe('aceptación antes del login', () => {
  it('guardarAceptacionLocal anota la versión en el celular', async () => {
    await guardarAceptacionLocal();
    expect(almacen.setItem).toHaveBeenCalledWith('stocky.terminosAceptados', VERSION_TERMINOS);
  });

  it('si se aceptó esta versión antes del login, la registra y limpia la marca', async () => {
    almacen.getItem.mockResolvedValue(VERSION_TERMINOS);

    await expect(registrarAceptacionPendiente()).resolves.toBe(true);

    expect(mockRpc).toHaveBeenCalledWith('aceptar_terminos', { p_version: VERSION_TERMINOS });
    expect(almacen.removeItem).toHaveBeenCalledWith('stocky.terminosAceptados');
  });

  it('no registra nada si no hay aceptación local o es de otra versión', async () => {
    almacen.getItem.mockResolvedValue(null);
    await expect(registrarAceptacionPendiente()).resolves.toBe(false);

    almacen.getItem.mockResolvedValue('2020-01-01');
    await expect(registrarAceptacionPendiente()).resolves.toBe(false);

    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('si falla el registro, no rompe y conserva la marca para reintentar', async () => {
    almacen.getItem.mockResolvedValue(VERSION_TERMINOS);
    mockRpc.mockResolvedValue({ error: new Error('sin red') });

    await expect(registrarAceptacionPendiente()).resolves.toBe(false);
    expect(almacen.removeItem).not.toHaveBeenCalled();
  });
});
