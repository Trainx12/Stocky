/**
 * Tests de src/services/listaCompras.ts: armar ítems (con y sin catálogo),
 * qué de "Stock bajo" falta pasar a la lista, orden, textos, y "Guardé las
 * compras" (carga en la despensa con crearProducto y saca de la lista).
 * Supabase y crearProducto se mockean.
 */
const mockDelete = jest.fn();
const mockInsert = jest.fn();
const mockIn = jest.fn();
const mockOrder = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      insert: (...args: unknown[]) => mockInsert(...args),
      delete: () => ({ in: (...args: unknown[]) => mockDelete(...args) }),
      select: () => ({ eq: () => ({ order: (...args: unknown[]) => mockOrder(...args) }) }),
      update: () => ({ eq: (...args: unknown[]) => mockIn(...args) }),
    })),
  },
}));

jest.mock('./productos', () => ({
  ...jest.requireActual('./productos'),
  crearProducto: jest.fn(),
}));

import type { ItemListaCompras, ProductoCatalogo } from '../types/database';
import type { AlertaStock } from './productos';
import { crearProducto } from './productos';
import {
  agregarSiFalta,
  ajustarCantidadItem,
  claveItem,
  faltantesParaLista,
  guardarComprasEnDespensa,
  itemDesdeProducto,
  itemDesdeTexto,
  ordenarLista,
  seTermino,
  textoCantidadItem,
  validarItem,
} from './listaCompras';

function item(nombre: string, extra: Partial<ItemListaCompras> = {}): ItemListaCompras {
  return {
    id: `id-${nombre}`,
    hogar_id: 'h1',
    nombre,
    categoria: 'Otros',
    unidad: 'unidad',
    cantidad: 1,
    catalogo_id: null,
    comprado: false,
    creado_por: 'u1',
    created_at: '2026-10-12T10:00:00Z',
    ...extra,
  };
}

function alerta(nombre: string, extra: Partial<AlertaStock> = {}): AlertaStock {
  return {
    clave: `h1|${nombre}`,
    hogarId: 'h1',
    nombre,
    unidad: 'unidad',
    cantidadTotal: 0,
    stockMinimo: 2,
    estado: 'agotado',
    categoria: 'Lácteos',
    catalogoId: `cat-${nombre}`,
    ...extra,
  } as AlertaStock;
}

const catalogo: ProductoCatalogo[] = [
  {
    id: 'cat-leche',
    nombre: 'Leche',
    categoria: 'Lácteos',
    unidad: 'l',
    imagen_url: null,
    estado: 'aprobado',
    sugerido_por: null,
    created_at: '2026-01-01',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockResolvedValue({ error: null });
  mockDelete.mockResolvedValue({ error: null });
});

describe('itemDesdeTexto', () => {
  it('si está en el catálogo, toma su nombre, categoría y unidad', () => {
    expect(itemDesdeTexto(' leches ', catalogo)).toEqual({
      nombre: 'Leche',
      cantidad: 1,
      unidad: 'l',
      categoria: 'Lácteos',
      catalogoId: 'cat-leche',
    });
  });

  it('si no está, queda como se escribió (con mayúscula), en Otros y por unidad', () => {
    expect(itemDesdeTexto('servilletas  de papel', catalogo)).toMatchObject({
      nombre: 'Servilletas de papel',
      unidad: 'unidad',
      categoria: 'Otros',
      catalogoId: null,
    });
  });
});

describe('validarItem', () => {
  it('pide nombre y cantidad positiva', () => {
    const base = itemDesdeTexto('Pan', []);
    expect(validarItem(base)).toBeNull();
    expect(validarItem({ ...base, nombre: '  ' })).toMatch(/Escribí/);
    expect(validarItem({ ...base, cantidad: 0 })).toMatch(/mayor a 0/);
    expect(validarItem({ ...base, nombre: 'x'.repeat(81) })).toMatch(/80/);
  });
});

describe('faltantesParaLista', () => {
  it('sugiere lo de stock bajo que no está en la lista, con lo que falta para el mínimo', () => {
    const faltantes = faltantesParaLista(
      [alerta('Yogur', { cantidadTotal: 1, stockMinimo: 4 }), alerta('Leche'), alerta('Pan', { cantidadTotal: 1.5, stockMinimo: 2 })],
      [item('leche')],
    );
    expect(faltantes.map((f) => [f.nombre, f.cantidad])).toEqual([
      ['Yogur', 3],
      ['Pan', 1], // 0,5 que falta → al menos 1
    ]);
    expect(faltantes[0]).toMatchObject({ categoria: 'Lácteos', catalogoId: 'cat-Yogur' });
  });

  it('el mismo producto en otra unidad sí se sugiere aparte', () => {
    expect(faltantesParaLista([alerta('Leche', { unidad: 'paquete' })], [item('Leche', { unidad: 'l' })])).toHaveLength(1);
  });
});

describe('ordenarLista y textos', () => {
  it('lo que falta comprar arriba (en orden de carga) y lo tildado abajo', () => {
    const lista = ordenarLista([
      item('A', { comprado: true, created_at: '2026-10-12T09:00:00Z' }),
      item('B', { created_at: '2026-10-12T11:00:00Z' }),
      item('C', { created_at: '2026-10-12T10:00:00Z' }),
    ]);
    expect(lista.map((i) => i.nombre)).toEqual(['C', 'B', 'A']);
  });

  it('textoCantidadItem', () => {
    expect(textoCantidadItem({ cantidad: 3, unidad: 'unidad' })).toBe('3');
    expect(textoCantidadItem({ cantidad: 1, unidad: 'paquete' })).toBe('1 paquete');
    expect(textoCantidadItem({ cantidad: 2, unidad: 'paquete' })).toBe('2 paquetes');
    expect(textoCantidadItem({ cantidad: 1.5, unidad: 'kg' })).toBe('1,5 kg');
  });

  it('ajustarCantidadItem no baja de 1', () => {
    expect(ajustarCantidadItem(2, -1)).toBe(1);
    expect(ajustarCantidadItem(1, -1)).toBe(1);
    expect(ajustarCantidadItem(1, 1)).toBe(2);
  });

  it('claveItem ignora mayúsculas y tildes', () => {
    expect(claveItem({ nombre: 'Jamón', unidad: 'g' })).toBe(claveItem({ nombre: 'jamon', unidad: 'g' }));
  });
});

describe('seTermino e itemDesdeProducto', () => {
  it('solo si no queda nada de ese producto en ningún lote', () => {
    const producto = { nombre: 'Leche', unidad: 'l' as const };
    expect(seTermino(producto, [{ nombre: 'Leche', unidad: 'l', cantidad: 0 }])).toBe(true);
    expect(seTermino(producto, [{ nombre: 'Leche', unidad: 'l', cantidad: 0 }, { nombre: 'leche', unidad: 'l', cantidad: 2 }])).toBe(false);
    expect(seTermino(producto, [{ nombre: 'Leche', unidad: 'paquete', cantidad: 2 }])).toBe(true);
  });

  it('la cantidad sugerida es el stock mínimo (o 1)', () => {
    const base = { nombre: 'Leche', unidad: 'l' as const, categoria: 'Lácteos', catalogo_id: 'cat-leche' };
    expect(itemDesdeProducto({ ...base, stock_minimo: 3 }).cantidad).toBe(3);
    expect(itemDesdeProducto({ ...base, stock_minimo: 0 })).toEqual({
      nombre: 'Leche',
      cantidad: 1,
      unidad: 'l',
      categoria: 'Lácteos',
      catalogoId: 'cat-leche',
    });
  });
});

describe('agregarSiFalta', () => {
  it('no repite algo que ya está pendiente en la lista', async () => {
    mockOrder.mockResolvedValue({ data: [item('Leche', { unidad: 'l' })], error: null });
    const agregado = await agregarSiFalta('h1', itemDesdeTexto('leche', catalogo), 'u1');
    expect(agregado).toBe(false);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('si no está (o ya se compró), lo agrega a nombre de quien lo pide', async () => {
    mockOrder.mockResolvedValue({ data: [item('Leche', { unidad: 'l', comprado: true })], error: null });
    const agregado = await agregarSiFalta('h1', itemDesdeTexto('leche', catalogo), 'u1');
    expect(agregado).toBe(true);
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ hogar_id: 'h1', nombre: 'Leche', unidad: 'l', catalogo_id: 'cat-leche', creado_por: 'u1' }),
    ]);
  });
});

describe('guardarComprasEnDespensa', () => {
  it('carga lo tildado en la despensa y lo saca de la lista; lo que falla queda', async () => {
    (crearProducto as jest.Mock).mockImplementation(async (_h: string, datos: { nombre: string }) => {
      if (datos.nombre === 'Pan') throw new Error('sin red');
      return {};
    });
    const items = [
      item('Leche', { comprado: true, unidad: 'l', cantidad: 2, categoria: 'Lácteos', catalogo_id: 'cat-leche' }),
      item('Pan', { comprado: true }),
      item('Yogur'), // no tildado: no se toca
    ];

    const resultado = await guardarComprasEnDespensa('h1', items);

    expect(resultado).toEqual({ guardados: 1, fallidos: 1 });
    expect(crearProducto).toHaveBeenCalledTimes(2);
    expect(crearProducto).toHaveBeenCalledWith('h1', expect.objectContaining({ nombre: 'Leche', unidad: 'l', cantidad: 2, catalogoId: 'cat-leche' }));
    expect(mockDelete).toHaveBeenCalledWith('id', ['id-Leche']);
  });
});
