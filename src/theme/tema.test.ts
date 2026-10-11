/**
 * Tests del modo oscuro (Sprint 10): qué esquema corresponde según la
 * elección del usuario y el modo del celular, que las dos paletas tengan
 * exactamente los mismos colores (si falta uno, una pantalla quedaría con
 * el del otro modo) y que aplicarEsquema cambie los valores en el lugar.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({ getItem: jest.fn(), setItem: jest.fn() }));

import { modoGuardadoValido, resolverEsquema } from '../context/TemaContext';
import { aplicarEsquema, colors, coloresDe, gradients, stockStatus } from './colors';

afterEach(() => {
  aplicarEsquema('claro');
});

describe('resolverEsquema', () => {
  it('claro y oscuro son fijos, sin importar el celular', () => {
    expect(resolverEsquema('claro', 'dark')).toBe('claro');
    expect(resolverEsquema('oscuro', 'light')).toBe('oscuro');
  });

  it('"sistema" sigue al celular (y si no informa nada, claro)', () => {
    expect(resolverEsquema('sistema', 'dark')).toBe('oscuro');
    expect(resolverEsquema('sistema', 'light')).toBe('claro');
    expect(resolverEsquema('sistema', null)).toBe('claro');
  });
});

describe('modoGuardadoValido', () => {
  it('acepta los tres modos y, si nunca se eligió (o es inválido), arranca en claro', () => {
    expect(modoGuardadoValido('oscuro')).toBe('oscuro');
    expect(modoGuardadoValido('claro')).toBe('claro');
    expect(modoGuardadoValido('sistema')).toBe('sistema');
    expect(modoGuardadoValido(null)).toBe('claro');
    expect(modoGuardadoValido('azul')).toBe('claro');
  });
});

describe('paletas', () => {
  it('claro y oscuro definen exactamente los mismos colores', () => {
    expect(Object.keys(coloresDe('oscuro')).sort()).toEqual(Object.keys(coloresDe('claro')).sort());
  });

  it('en oscuro el fondo es oscuro y el texto claro (y al revés en claro)', () => {
    const luminosidad = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    const oscuro = coloresDe('oscuro');
    const claro = coloresDe('claro');
    expect(luminosidad(oscuro.background)).toBeLessThan(luminosidad(oscuro.textPrimary));
    expect(luminosidad(claro.background)).toBeGreaterThan(luminosidad(claro.textPrimary));
  });

  it('el texto sobre botones de color sigue siendo blanco en los dos modos', () => {
    expect(coloresDe('oscuro').white).toBe('#FFFFFF');
  });
});

describe('aplicarEsquema', () => {
  it('cambia en el lugar colors, stockStatus y gradients, y vuelve atrás', () => {
    const fondoClaro = colors.background;

    aplicarEsquema('oscuro');
    expect(colors.background).toBe(coloresDe('oscuro').background);
    expect(colors.stockStatus).toBe(stockStatus); // mismo objeto, valores nuevos
    expect(stockStatus.low).toBe(coloresDe('oscuro').warning);
    expect(gradients.primary[0]).toBe(coloresDe('oscuro').primary);

    aplicarEsquema('claro');
    expect(colors.background).toBe(fondoClaro);
    expect(stockStatus.low).toBe(coloresDe('claro').warning);
  });
});
