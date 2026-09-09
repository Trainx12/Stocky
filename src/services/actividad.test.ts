/**
 * Test de src/services/actividad.ts. La lógica real (qué se registra y
 * cuándo) vive en los triggers de
 * supabase/migrations/20260907130000_actividad_hogar.sql -- acá solo se
 * verifica que el wrapper llame a la RPC correcta y mapee la fila cruda
 * (snake_case) a ActividadItem (camelCase).
 */
jest.mock('../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));

import { supabase } from '../lib/supabase';
import { listarActividadReciente } from './actividad';

const rpc = supabase.rpc as jest.Mock;

beforeEach(() => {
  rpc.mockReset();
});

describe('listarActividadReciente', () => {
  it('llama a la RPC con el hogar y el límite (10 por default)', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await listarActividadReciente('hogar-1');

    expect(rpc).toHaveBeenCalledWith('listar_actividad_reciente', { p_hogar_id: 'hogar-1', p_limite: 10 });
  });

  it('respeta un límite explícito', async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    await listarActividadReciente('hogar-1', 5);

    expect(rpc).toHaveBeenCalledWith('listar_actividad_reciente', { p_hogar_id: 'hogar-1', p_limite: 5 });
  });

  it('mapea las filas crudas (snake_case) a ActividadItem (camelCase), incluyendo producto_nombre/cantidad', async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: 'a-1',
          tipo: 'producto_creado',
          descripcion: 'Se agregó "Leche"',
          usuario_nombre: 'Julieta',
          usuario_email: 'julieta@test.com',
          created_at: '2026-01-01T10:00:00Z',
          producto_nombre: 'Leche',
          cantidad: 2,
        },
        {
          id: 'a-2',
          tipo: 'producto_eliminado',
          descripcion: 'Se eliminó "Pan"',
          usuario_nombre: null,
          usuario_email: null,
          created_at: '2026-01-01T09:00:00Z',
          producto_nombre: 'Pan',
          cantidad: 1,
        },
        {
          id: 'a-3',
          tipo: 'producto_editado',
          descripcion: 'Se actualizó "Pan"',
          usuario_nombre: null,
          usuario_email: null,
          created_at: '2026-01-01T08:00:00Z',
          producto_nombre: null,
          cantidad: null,
        },
      ],
      error: null,
    });

    const resultado = await listarActividadReciente('hogar-1');

    expect(resultado).toEqual([
      {
        id: 'a-1',
        tipo: 'producto_creado',
        descripcion: 'Se agregó "Leche"',
        usuarioNombre: 'Julieta',
        usuarioEmail: 'julieta@test.com',
        createdAt: '2026-01-01T10:00:00Z',
        productoNombre: 'Leche',
        cantidad: 2,
      },
      {
        id: 'a-2',
        tipo: 'producto_eliminado',
        descripcion: 'Se eliminó "Pan"',
        usuarioNombre: null,
        usuarioEmail: null,
        createdAt: '2026-01-01T09:00:00Z',
        productoNombre: 'Pan',
        cantidad: 1,
      },
      {
        id: 'a-3',
        tipo: 'producto_editado',
        descripcion: 'Se actualizó "Pan"',
        usuarioNombre: null,
        usuarioEmail: null,
        createdAt: '2026-01-01T08:00:00Z',
        productoNombre: null,
        cantidad: null,
      },
    ]);
  });

  it('devuelve un array vacío si la RPC no trae datos', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    const resultado = await listarActividadReciente('hogar-1');

    expect(resultado).toEqual([]);
  });

  it('propaga el error si la RPC falla', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarActividadReciente('hogar-1')).rejects.toThrow('fallo de red');
  });
});
