/**
 * Tests de src/services/cuentas.ts (varias cuentas en el mismo celular).
 * AsyncStorage se simula con un objeto en memoria y Supabase con un mock:
 * se prueba qué se guarda, en qué orden y qué pasa si una sesión venció.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const almacen: Record<string, string> = {};
  return {
    almacen,
    getItem: jest.fn(async (clave: string) => almacen[clave] ?? null),
    setItem: jest.fn(async (clave: string, valor: string) => {
      almacen[clave] = valor;
    }),
    removeItem: jest.fn(async (clave: string) => {
      delete almacen[clave];
    }),
  };
});
jest.mock('../lib/supabase', () => ({ supabase: { auth: { setSession: jest.fn() } } }));

import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  cambiarACuenta,
  listarCuentas,
  olvidarCuenta,
  olvidarTodas,
  recordarSesion,
  siguienteCuenta,
  upsertCuenta,
} from './cuentas';
import type { CuentaGuardada } from './cuentas';

const almacen = (jest.requireMock('@react-native-async-storage/async-storage') as { almacen: Record<string, string> }).almacen;
const setSession = supabase.auth.setSession as jest.Mock;

// Sesión mínima de Supabase para los tests (solo lo que lee recordarSesion).
function sesion(id: string, email: string, token = `t-${id}`): Session {
  return {
    access_token: `acc-${token}`,
    refresh_token: `ref-${token}`,
    user: { id, email, user_metadata: { full_name: `Nombre ${id}` } },
  } as unknown as Session;
}

beforeEach(() => {
  for (const clave of Object.keys(almacen)) delete almacen[clave];
  jest.clearAllMocks();
  setSession.mockResolvedValue({ error: null });
});

describe('upsertCuenta / siguienteCuenta (lógica pura)', () => {
  const cuenta = (userId: string): CuentaGuardada => ({
    userId,
    email: `${userId}@mail.com`,
    nombre: null,
    accessToken: 'a',
    refreshToken: 'r',
    usadaEn: '2026-10-11',
  });

  it('upsertCuenta pone la cuenta primero y no la duplica', () => {
    const lista = upsertCuenta([cuenta('a'), cuenta('b')], { ...cuenta('b'), refreshToken: 'nuevo' });
    expect(lista.map((c) => c.userId)).toEqual(['b', 'a']);
    expect(lista[0].refreshToken).toBe('nuevo');
  });

  it('siguienteCuenta devuelve la más reciente que no es la actual, o null', () => {
    expect(siguienteCuenta([cuenta('a'), cuenta('b')], 'a')?.userId).toBe('b');
    expect(siguienteCuenta([cuenta('a')], 'a')).toBeNull();
  });
});

describe('recordarSesion / listarCuentas', () => {
  it('guarda cada cuenta con su nombre y email, la última usada primero, sin exponer tokens', async () => {
    await recordarSesion(sesion('u1', 'ana@mail.com'));
    await recordarSesion(sesion('u2', 'beto@mail.com'));

    const cuentas = await listarCuentas();

    expect(cuentas.map((c) => [c.userId, c.email, c.nombre])).toEqual([
      ['u2', 'beto@mail.com', 'Nombre u2'],
      ['u1', 'ana@mail.com', 'Nombre u1'],
    ]);
    expect(cuentas[0]).not.toHaveProperty('refreshToken');
  });

  it('al renovarse la sesión de una cuenta, actualiza sus tokens (no la duplica)', async () => {
    await recordarSesion(sesion('u1', 'ana@mail.com', 'viejo'));
    await recordarSesion(sesion('u1', 'ana@mail.com', 'nuevo'));

    expect(await listarCuentas()).toHaveLength(1);
    await cambiarACuenta('u1');
    expect(setSession).toHaveBeenCalledWith({ access_token: 'acc-nuevo', refresh_token: 'ref-nuevo' });
  });

  it('si lo guardado está corrupto, arranca de cero en vez de romper', async () => {
    almacen['stocky.cuentas'] = '{no es json';
    await expect(listarCuentas()).resolves.toEqual([]);
  });
});

describe('cambiarACuenta', () => {
  it('activa la sesión guardada de esa cuenta', async () => {
    await recordarSesion(sesion('u1', 'ana@mail.com'));
    setSession.mockResolvedValue({ error: null });

    await cambiarACuenta('u1');

    expect(setSession).toHaveBeenCalledWith({ access_token: 'acc-t-u1', refresh_token: 'ref-t-u1' });
  });

  it('si la sesión venció, olvida la cuenta y avisa que hay que agregarla de nuevo', async () => {
    await recordarSesion(sesion('u1', 'ana@mail.com'));
    setSession.mockResolvedValue({ error: new Error('Invalid Refresh Token') });

    await expect(cambiarACuenta('u1')).rejects.toThrow('ana@mail.com venció');
    expect(await listarCuentas()).toEqual([]);
  });

  it('falla claro si la cuenta no está guardada', async () => {
    await expect(cambiarACuenta('nadie')).rejects.toThrow('ya no está guardada');
    expect(setSession).not.toHaveBeenCalled();
  });
});

describe('olvidar', () => {
  it('olvidarCuenta saca solo esa y olvidarTodas vacía la lista', async () => {
    await recordarSesion(sesion('u1', 'ana@mail.com'));
    await recordarSesion(sesion('u2', 'beto@mail.com'));

    await olvidarCuenta('u1');
    expect((await listarCuentas()).map((c) => c.userId)).toEqual(['u2']);

    await olvidarTodas();
    expect(await listarCuentas()).toEqual([]);
  });
});
