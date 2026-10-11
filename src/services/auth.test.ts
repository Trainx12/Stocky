/**
 * Tests de signInWithGoogle()/signOut(). Se mockean expo-web-browser,
 * expo-linking y el cliente de Supabase: acá no se prueba red real, se
 * prueba la LÓGICA propia (parseo del fragment de la URL de retorno),
 * que es justo la parte que rompió más de una vez durante el desarrollo
 * (ver docs/incidentes-sprint1.md).
 */
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn(() => 'stocky://auth/callback'),
}));

jest.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      setSession: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { registrarTareaAntesDeCerrarSesion, signInWithGoogle, signOut } from './auth';

const signInWithOAuth = supabase.auth.signInWithOAuth as jest.Mock;
const setSession = supabase.auth.setSession as jest.Mock;
const signOutMock = supabase.auth.signOut as jest.Mock;
const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  signInWithOAuth.mockResolvedValue({
    data: { url: 'https://proyecto.supabase.co/auth/v1/authorize?provider=google' },
    error: null,
  });
});

describe('signInWithGoogle', () => {
  it('extrae access_token y refresh_token del fragment y arma la sesión', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'stocky://auth/callback#access_token=abc123&refresh_token=def456',
    });
    setSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
      error: null,
    });

    const session = await signInWithGoogle();

    expect(setSession).toHaveBeenCalledWith({
      access_token: 'abc123',
      refresh_token: 'def456',
    });
    expect(session).toEqual({ user: { id: 'u1' } });
  });

  it('lanza un error si Supabase no devuelve una URL de autorización', async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    await expect(signInWithGoogle()).rejects.toThrow(/URL de autenticación/);
  });

  it('lanza un error si el usuario cancela el login en el navegador', async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'dismiss' });

    await expect(signInWithGoogle()).rejects.toThrow(/cancelado/);
  });

  it('lanza el error_description si Google/Supabase lo mandan en el fragment', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'stocky://auth/callback#error_description=access_denied',
    });

    await expect(signInWithGoogle()).rejects.toThrow('access_denied');
  });

  it('lanza un error si al fragment le falta alguno de los dos tokens', async () => {
    openAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'stocky://auth/callback#access_token=abc123',
    });

    await expect(signInWithGoogle()).rejects.toThrow(/tokens de sesión/);
  });
});

describe('signOut', () => {
  it('llama a supabase.auth.signOut()', async () => {
    signOutMock.mockResolvedValue({ error: null });

    await signOut();

    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it('propaga el error si signOut falla', async () => {
    signOutMock.mockResolvedValue({ error: new Error('sin red') });

    await expect(signOut()).rejects.toThrow('sin red');
  });

  it('corre las tareas registradas ANTES de cerrar la sesión', async () => {
    const orden: string[] = [];
    signOutMock.mockImplementation(async () => {
      orden.push('signOut');
      return { error: null };
    });
    const quitar = registrarTareaAntesDeCerrarSesion(async () => {
      orden.push('tarea');
    });

    await signOut();
    quitar();

    expect(orden).toEqual(['tarea', 'signOut']);
  });

  it('cierra la sesión igual si una tarea previa falla', async () => {
    signOutMock.mockResolvedValue({ error: null });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const quitar = registrarTareaAntesDeCerrarSesion(async () => {
      throw new Error('sin red');
    });

    await expect(signOut()).resolves.toBeUndefined();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    quitar();
    warn.mockRestore();
  });

  it('una tarea desregistrada ya no corre', async () => {
    signOutMock.mockResolvedValue({ error: null });
    const tarea = jest.fn().mockResolvedValue(undefined);
    registrarTareaAntesDeCerrarSesion(tarea)();

    await signOut();

    expect(tarea).not.toHaveBeenCalled();
  });
});
