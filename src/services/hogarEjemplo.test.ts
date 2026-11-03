/**
 * Tests de la parte pura del hogar de ejemplo (src/services/hogarEjemplo.ts).
 */
jest.mock('../lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), auth: { getUser: jest.fn() } } }));

import { buscarHogarDeEjemplo, esHogarDeEjemplo, NOMBRE_HOGAR_EJEMPLO, productosDeEjemplo } from './hogarEjemplo';
import type { HogarConRol } from './hogares';
import { estadoVencimiento } from './productos';

describe('productosDeEjemplo', () => {
  const hoy = new Date(2026, 9, 25, 12, 0);
  const productos = productosDeEjemplo('h1', hoy);

  it('muestra todos los casos: vencido, por vencer, bien, stock bajo y agotado', () => {
    const estados = productos.map((p) => estadoVencimiento({ ...p, dias_aviso_vencimiento: null }, hoy, 7));
    expect(estados).toContain('vencido');
    expect(estados).toContain('proximo');
    expect(estados).toContain('ok');
    expect(productos.some((p) => p.stock_minimo > 0 && p.cantidad < p.stock_minimo)).toBe(true);
    expect(productos.some((p) => p.cantidad === 0)).toBe(true);
  });

  it('todos van al hogar de ejemplo', () => {
    expect(productos.every((p) => p.hogar_id === 'h1')).toBe(true);
  });
});

describe('buscarHogarDeEjemplo', () => {
  const hogar = (nombre: string, miRol: 'dueno' | 'invitado') => ({ id: nombre, nombre, miRol }) as unknown as HogarConRol;

  it('lo reconoce por el nombre, solo si es la dueña', () => {
    expect(esHogarDeEjemplo({ nombre: NOMBRE_HOGAR_EJEMPLO })).toBe(true);
    expect(buscarHogarDeEjemplo([hogar('Casa', 'dueno'), hogar(NOMBRE_HOGAR_EJEMPLO, 'dueno')])?.id).toBe(NOMBRE_HOGAR_EJEMPLO);
    expect(buscarHogarDeEjemplo([hogar(NOMBRE_HOGAR_EJEMPLO, 'invitado')])).toBeNull();
    expect(buscarHogarDeEjemplo([hogar('Casa', 'dueno')])).toBeNull();
  });
});
