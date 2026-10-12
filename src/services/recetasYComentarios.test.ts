/**
 * Tests de src/services/recetas.ts (qué productos se mandan a "¿Qué cocino
 * con esto?" y qué recetas se aceptan) y src/services/comentarios.ts
 * (validación, envío, resumen del mes). Supabase se mockea.
 */
const mockInsert = jest.fn();
const mockRpc = jest.fn();
jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ insert: (...a: unknown[]) => mockInsert(...a) })),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

import type { Producto } from '../types/database';
import { ingredientesParaRecetas, MAX_INGREDIENTES_RECETAS, recetasValidas } from './recetas';
import {
  enviarComentario,
  mensajeDelResumen,
  nombreDelMes,
  obtenerResumenDelMes,
  primerDiaDelMes,
  validarComentario,
} from './comentarios';

const HOY = new Date(2026, 9, 12); // 12/10/2026, hora local

function producto(nombre: string, vence: string | null, extra: Partial<Producto> = {}): Producto {
  return {
    id: `p-${nombre}-${vence}`,
    hogar_id: 'h1',
    nombre,
    categoria: 'Otros',
    unidad: 'unidad',
    cantidad: 1,
    stock_minimo: 0,
    fecha_vencimiento: vence,
    alerta_vencimiento_habilitada: true,
    catalogo_id: null,
    marca: null,
    dias_aviso_vencimiento: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...extra,
  };
}

beforeEach(() => jest.clearAllMocks());

describe('ingredientesParaRecetas', () => {
  it('solo lo por vencer (no lo vencido, ni lo lejano, ni lo agotado), del que vence antes', () => {
    const lista = ingredientesParaRecetas(
      [
        producto('Yogur', '2026-10-14'),
        producto('Leche', '2026-10-13'),
        producto('Queso', '2026-10-10'), // vencido
        producto('Arroz', '2027-05-01'), // lejos
        producto('Manteca', '2026-10-13', { cantidad: 0 }), // no queda
        producto('Pan', null),
      ],
      HOY,
      3,
    );
    expect(lista.map((i) => i.nombre)).toEqual(['Leche', 'Yogur']);
    expect(lista[0]).toEqual({ nombre: 'Leche', cantidad: 1, unidad: 'unidad', vence: '2026-10-13' });
  });

  it('no repite el mismo producto (varios lotes) y corta en el máximo', () => {
    const muchos = Array.from({ length: 20 }, (_, i) => producto(`P${i}`, '2026-10-13'));
    expect(ingredientesParaRecetas([...muchos, producto('p0', '2026-10-14')], HOY, 3)).toHaveLength(MAX_INGREDIENTES_RECETAS);
    expect(ingredientesParaRecetas([producto('Leche', '2026-10-13'), producto('leche', '2026-10-14')], HOY, 3)).toHaveLength(1);
  });
});

describe('recetasValidas', () => {
  it('descarta recetas sin título, sin pasos o que no usan nada de la despensa', () => {
    const recetas = recetasValidas([
      { titulo: ' Licuado ', minutos: 5.4, usa: ['Leche', ''], ademas: ['Azúcar'], pasos: ['Licuá todo.'] },
      { titulo: '', usa: ['Leche'], pasos: ['x'] },
      { titulo: 'Nada', usa: [], pasos: ['x'] },
      { titulo: 'Sin pasos', usa: ['Leche'], pasos: [] },
      null,
    ]);
    expect(recetas).toEqual([{ titulo: 'Licuado', minutos: 5, usa: ['Leche'], ademas: ['Azúcar'], pasos: ['Licuá todo.'] }]);
  });
});

describe('comentarios', () => {
  it('valida largo mínimo y máximo', () => {
    expect(validarComentario('  ok ')).toMatch(/un poco más/);
    expect(validarComentario('Me encanta la app')).toBeNull();
    expect(validarComentario('x'.repeat(2001))).toMatch(/2000/);
  });

  it('envía a nombre del usuario, con plataforma y versión', async () => {
    mockInsert.mockResolvedValue({ error: null });
    await enviarComentario('u1', 'problema', '  No carga el ticket  ', { plataforma: 'android', version: '1.0.0' });
    expect(mockInsert).toHaveBeenCalledWith({
      usuario_id: 'u1',
      tipo: 'problema',
      mensaje: 'No carga el ticket',
      plataforma: 'android',
      version_app: '1.0.0',
    });
  });

  it('no envía un comentario vacío', async () => {
    await expect(enviarComentario('u1', 'idea', ' ', { plataforma: 'web', version: '1' })).rejects.toThrow();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});

describe('resumen del mes', () => {
  it('primer día y nombre del mes en hora local', () => {
    expect(primerDiaDelMes(HOY)).toBe('2026-10-01');
    expect(nombreDelMes(HOY)).toBe('octubre');
  });

  it('pide el resumen desde el primer día del mes y convierte a números', async () => {
    mockRpc.mockResolvedValue({ data: { cargados: '5', usados: 3, vencidos: 0, por_vencer_semana: 2 }, error: null });
    await expect(obtenerResumenDelMes('h1', HOY)).resolves.toEqual({ cargados: 5, usados: 3, vencidos: 0, por_vencer_semana: 2 });
    expect(mockRpc).toHaveBeenCalledWith('resumen_del_mes', { p_hogar_id: 'h1', p_desde: '2026-10-01' });
  });

  it('el mensaje motiva según cómo viene el mes', () => {
    const base = { cargados: 0, usados: 0, vencidos: 0, por_vencer_semana: 0 };
    expect(mensajeDelResumen(base)).toMatch(/Todavía no hay movimientos/);
    expect(mensajeDelResumen({ ...base, cargados: 4 })).toMatch(/Nada se te venció/);
    expect(mensajeDelResumen({ ...base, usados: 9, vencidos: 2 })).toMatch(/Vas muy bien/);
    expect(mensajeDelResumen({ ...base, usados: 1, vencidos: 2 })).toMatch(/Próximos a vencer/);
  });
});
