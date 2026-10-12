/**
 * Tests de src/services/preferenciasHogar.ts: qué hogar se muestra al
 * volver a abrir la app, de qué hogares salen las alertas del inicio, y que
 * las preferencias se guarden por cuenta. AsyncStorage se simula en memoria.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const datos: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in datos ? datos[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        datos[k] = v;
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  elegirHogarInicial,
  guardarAlertasDeTodos,
  guardarHogarSeleccionado,
  hogaresDeLasAlertas,
  leerAlertasDeTodos,
  leerHogarGuardado,
} from './preferenciasHogar';

describe('elegirHogarInicial', () => {
  const ids = ['casa', 'playa', 'oficina'];

  it('prioriza el hogar elegido la última vez', () => {
    expect(elegirHogarInicial(ids, 'playa', 'casa')).toBe('playa');
  });

  it('si ya no soy miembro del recordado, usa el hogar activo', () => {
    expect(elegirHogarInicial(ids, 'viejo', 'oficina')).toBe('oficina');
  });

  it('sin recordado ni activo válido, el primero', () => {
    expect(elegirHogarInicial(ids, null, null)).toBe('casa');
    expect(elegirHogarInicial(ids, null, 'otro')).toBe('casa');
  });

  it('sin hogares, ninguno', () => {
    expect(elegirHogarInicial([], 'playa', 'casa')).toBeNull();
  });
});

describe('hogaresDeLasAlertas', () => {
  const ids = ['casa', 'playa'];

  it('por defecto, solo el hogar que se está usando', () => {
    expect(hogaresDeLasAlertas(ids, 'playa', false)).toEqual(['playa']);
  });

  it('con la opción "todos", todos mis hogares', () => {
    expect(hogaresDeLasAlertas(ids, 'playa', true)).toEqual(['casa', 'playa']);
  });

  it('sin hogar elegido (o uno que ya no es mío), ninguno', () => {
    expect(hogaresDeLasAlertas(ids, null, false)).toEqual([]);
    expect(hogaresDeLasAlertas(ids, 'ajeno', false)).toEqual([]);
  });
});

describe('guardar y leer', () => {
  it('recuerda el hogar elegido por cuenta', async () => {
    await guardarHogarSeleccionado('ana', 'playa');
    await guardarHogarSeleccionado('beto', 'casa');
    await expect(leerHogarGuardado('ana')).resolves.toBe('playa');
    await expect(leerHogarGuardado('beto')).resolves.toBe('casa');
    await expect(leerHogarGuardado('nadie')).resolves.toBeNull();
  });

  it('la opción "todos" arranca apagada y se puede prender y apagar', async () => {
    await expect(leerAlertasDeTodos('ana')).resolves.toBe(false);
    await guardarAlertasDeTodos('ana', true);
    await expect(leerAlertasDeTodos('ana')).resolves.toBe(true);
    await expect(leerAlertasDeTodos('beto')).resolves.toBe(false);
    await guardarAlertasDeTodos('ana', false);
    await expect(leerAlertasDeTodos('ana')).resolves.toBe(false);
  });

  it('si el almacenamiento falla al leer, se comporta como sin preferencias', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('sin storage'));
    await expect(leerHogarGuardado('ana')).resolves.toBeNull();
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('sin storage'));
    await expect(leerAlertasDeTodos('ana')).resolves.toBe(false);
  });
});
