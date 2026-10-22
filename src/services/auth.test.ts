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
      getSession: jest.fn(),
    },
    rpc: jest.fn(),
  },
}));

// Varias cuentas (services/cuentas.ts tiene sus propios tests): acá solo
// importa qué le pide auth.ts al cerrar sesión.
jest.mock('./cuentas', () => ({
  cambiarACuenta: jest.fn(),
  listarCuentas: jest.fn(),
  olvidarCuenta: jest.fn(),
  olvidarTodas: jest.fn(),
  // Misma regla que la real (testeada en cuentas.test.ts), sin cargar AsyncStorage.
  siguienteCuenta: (cuentas: { userId: string }[], actual: string) => cuentas.find((c) => c.userId !== actual) ?? null,
}));

// La foto de perfil tiene sus propios tests (avatar.test.ts): acá solo
// importa en qué orden se borra al borrar la cuenta.
jest.mock('./avatar', () => ({ borrarMisFotosDePerfil: jest.fn() }));

import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { cerrarTodasLasSesiones, eliminarMiCuenta, registrarTareaAntesDeCerrarSesion, signInWithGoogle, signOut } from './auth';
import { cambiarACuenta, listarCuentas, olvidarCuenta, olvidarTodas } from './cuentas';
import { borrarMisFotosDePerfil } from './avatar';

const signInWithOAuth = supabase.auth.signInWithOAuth as jest.Mock;
const setSession = supabase.auth.setSession as jest.Mock;
const signOutMock = supabase.auth.signOut as jest.Mock;
const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as jest.Mock;
const getSession = supabase.auth.getSession as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
  (listarCuentas as jest.Mock).mockResolvedValue([]);
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

  // incidentes-sprint10.md #23: en la web, la ventana emergente no se
  // cerraba y quedaba la app sin sesión (bienvenida/términos sin salida).
  it('en la web va a Google en la misma pestaña, sin ventana emergente', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    try {
      const session = await signInWithGoogle();

      expect(signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: 'stocky://auth/callback', queryParams: { prompt: 'select_account' } },
      });
      // Sin skipBrowserRedirect: supabase-js redirige la página.
      expect(signInWithOAuth.mock.calls[0][0].options.skipBrowserRedirect).toBeUndefined();
      expect(openAuthSessionAsync).not.toHaveBeenCalled();
      expect(setSession).not.toHaveBeenCalled();
      expect(session).toBeNull();
    } finally {
      jest.restoreAllMocks();
    }
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
  it('cierra solo la sesión de este celular y olvida la cuenta', async () => {
    signOutMock.mockResolvedValue({ error: null });

    await signOut();

    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(olvidarCuenta).toHaveBeenCalledWith('u1');
    expect(cambiarACuenta).not.toHaveBeenCalled();
  });

  it('si quedan otras cuentas guardadas, pasa a la usada más recientemente', async () => {
    signOutMock.mockResolvedValue({ error: null });
    (listarCuentas as jest.Mock).mockResolvedValue([{ userId: 'u2' }, { userId: 'u3' }]);

    await signOut();

    expect(cambiarACuenta).toHaveBeenCalledWith('u2');
  });

  it('si la otra cuenta ya no sirve, no rompe (queda en la bienvenida)', async () => {
    signOutMock.mockResolvedValue({ error: null });
    (listarCuentas as jest.Mock).mockResolvedValue([{ userId: 'u2' }]);
    (cambiarACuenta as jest.Mock).mockRejectedValue(new Error('venció'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(signOut()).resolves.toBeUndefined();
    warn.mockRestore();
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

describe('cerrarTodasLasSesiones', () => {
  it('cierra la sesión activa y olvida todas las cuentas guardadas', async () => {
    signOutMock.mockResolvedValue({ error: null });

    await cerrarTodasLasSesiones();

    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(olvidarTodas).toHaveBeenCalled();
  });
});

describe('signInWithGoogle elige cuenta', () => {
  it('pide a Google que pregunte con qué cuenta entrar (para poder agregar otra)', async () => {
    openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    await expect(signInWithGoogle()).rejects.toThrow();

    expect(signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ queryParams: { prompt: 'select_account' } }),
      }),
    );
  });
});

describe('eliminarMiCuenta', () => {
  const rpc = supabase.rpc as jest.Mock;

  it('desregistra el push, borra la foto y la cuenta en la base, cierra sesión y la olvida', async () => {
    const orden: string[] = [];
    const quitar = registrarTareaAntesDeCerrarSesion(async () => {
      orden.push('tarea');
    });
    (borrarMisFotosDePerfil as jest.Mock).mockImplementation(async () => {
      orden.push('foto');
    });
    rpc.mockImplementation(async () => {
      orden.push('rpc');
      return { error: null };
    });
    signOutMock.mockResolvedValue({ error: null });

    await eliminarMiCuenta();
    quitar();

    expect(orden).toEqual(['tarea', 'foto', 'rpc']);
    expect(borrarMisFotosDePerfil).toHaveBeenCalledWith('u1');
    expect(rpc).toHaveBeenCalledWith('eliminar_mi_cuenta');
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(olvidarCuenta).toHaveBeenCalledWith('u1');
  });

  it('si la base no la borra, no cierra la sesión ni olvida la cuenta', async () => {
    rpc.mockResolvedValue({ error: new Error('sin red') });
    await expect(eliminarMiCuenta()).rejects.toThrow('sin red');
    expect(signOutMock).not.toHaveBeenCalled();
    expect(olvidarCuenta).not.toHaveBeenCalled();
  });

  it('si no se puede borrar la foto, no borra la cuenta', async () => {
    (borrarMisFotosDePerfil as jest.Mock).mockRejectedValueOnce(new Error('No se pudo borrar tu foto de perfil'));
    await expect(eliminarMiCuenta()).rejects.toThrow('foto de perfil');
    expect(rpc).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('si quedan otras cuentas en el celular, pasa a la siguiente', async () => {
    rpc.mockResolvedValue({ error: null });
    signOutMock.mockResolvedValue({ error: null });
    (listarCuentas as jest.Mock).mockResolvedValue([{ userId: 'u2' }]);
    await eliminarMiCuenta();
    expect(cambiarACuenta).toHaveBeenCalledWith('u2');
  });
});
