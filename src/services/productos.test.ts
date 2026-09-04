/**
 * Tests de src/services/productos.ts. Todas las operaciones son un solo
 * .insert()/.update()/.select()/.delete() contra la tabla "productos" (no
 * hay RPC: la RLS ya valida pertenencia al hogar, ver el comentario en el
 * propio archivo), así que acá se verifica sobre todo la validación de
 * datos hecha del lado del cliente antes de pegarle a Supabase, y que cada
 * wrapper arme la consulta correcta y propague errores.
 */
const mockSingle = jest.fn();
const mockInsertSelect = jest.fn(() => ({ single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: mockInsertSelect }));
const mockUpdateSelect = jest.fn(() => ({ single: mockSingle }));
const mockUpdateEq = jest.fn(() => ({ select: mockUpdateSelect }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockDeleteEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));
const mockOrder = jest.fn();
const mockSelectEq = jest.fn(() => ({ order: mockOrder }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete })),
  },
}));

import { supabase } from '../lib/supabase';
import { categoriasEnUso, crearProducto, editarProducto, eliminarProducto, filtrarProductos, listarProductos, parsearNumero } from './productos';
import type { DatosProducto } from './productos';
import type { Producto } from '../types/database';

const from = supabase.from as jest.Mock;

const datosValidos: DatosProducto = {
  nombre: 'Leche',
  categoria: 'Lácteos',
  unidad: 'l',
  cantidad: 2,
  stockMinimo: 1,
};

beforeEach(() => {
  from.mockClear();
  mockSelect.mockClear();
  mockSelectEq.mockClear();
  mockOrder.mockReset();
  mockInsert.mockClear();
  mockInsertSelect.mockClear();
  mockUpdate.mockClear();
  mockUpdateEq.mockClear();
  mockUpdateSelect.mockClear();
  mockDelete.mockClear();
  mockDeleteEq.mockReset();
  mockSingle.mockReset();
});

describe('listarProductos', () => {
  it('filtra explícitamente por hogar_id (regresión: no debe apoyarse solo en RLS)', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    await listarProductos('hogar-1');

    expect(from).toHaveBeenCalledWith('productos');
    expect(mockSelectEq).toHaveBeenCalledWith('hogar_id', 'hogar-1');
  });

  it('devuelve la lista de productos del hogar', async () => {
    const productos = [{ id: 'p1', hogar_id: 'hogar-1', nombre: 'Leche' }];
    mockOrder.mockResolvedValue({ data: productos, error: null });

    const resultado = await listarProductos('hogar-1');

    expect(resultado).toEqual(productos);
  });

  it('devuelve un array vacío si data es null', async () => {
    mockOrder.mockResolvedValue({ data: null, error: null });

    const resultado = await listarProductos('hogar-1');

    expect(resultado).toEqual([]);
  });

  it('propaga el error si falla la consulta', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarProductos('hogar-1')).rejects.toThrow('fallo de red');
  });
});

describe('crearProducto', () => {
  it('inserta el producto recortando nombre/categoría y devuelve la fila creada', async () => {
    const producto = { id: 'p1', hogar_id: 'hogar-1', nombre: 'Leche', categoria: 'Lácteos', unidad: 'l', cantidad: 2, stock_minimo: 1 };
    mockSingle.mockResolvedValue({ data: producto, error: null });

    const resultado = await crearProducto('hogar-1', { ...datosValidos, nombre: '  Leche  ', categoria: '  Lácteos  ' });

    expect(from).toHaveBeenCalledWith('productos');
    expect(mockInsert).toHaveBeenCalledWith({
      hogar_id: 'hogar-1',
      nombre: 'Leche',
      categoria: 'Lácteos',
      unidad: 'l',
      cantidad: 2,
      stock_minimo: 1,
    });
    expect(resultado).toEqual(producto);
  });

  it('rechaza un nombre vacío sin llamar a Supabase', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, nombre: '   ' })).rejects.toThrow(
      'El nombre del producto no puede estar vacío',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza una categoría vacía o solo espacios sin llamar a Supabase (la categoría es obligatoria)', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, categoria: '   ' })).rejects.toThrow(
      'Elegí una categoría para el producto',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza cantidad negativa sin llamar a Supabase', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, cantidad: -1 })).rejects.toThrow(
      'La cantidad no puede ser negativa',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza stock mínimo negativo sin llamar a Supabase', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, stockMinimo: -1 })).rejects.toThrow(
      'El stock mínimo no puede ser negativo',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('acepta cantidad y stock mínimo en 0', async () => {
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, cantidad: 0, stockMinimo: 0 });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ cantidad: 0, stock_minimo: 0 }));
  });

  it('propaga el error si la RLS rechaza el insert (no es miembro del hogar)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('new row violates row-level security policy') });

    await expect(crearProducto('hogar-ajeno', datosValidos)).rejects.toThrow('new row violates row-level security policy');
  });
});

describe('editarProducto', () => {
  it('actualiza los campos editables y devuelve la fila actualizada', async () => {
    const producto = { id: 'p1', nombre: 'Leche descremada', cantidad: 3 };
    mockSingle.mockResolvedValue({ data: producto, error: null });

    const resultado = await editarProducto('p1', { ...datosValidos, nombre: 'Leche descremada', cantidad: 3 });

    expect(from).toHaveBeenCalledWith('productos');
    expect(mockUpdate).toHaveBeenCalledWith({
      nombre: 'Leche descremada',
      categoria: 'Lácteos',
      unidad: 'l',
      cantidad: 3,
      stock_minimo: 1,
    });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'p1');
    expect(resultado).toEqual(producto);
  });

  it('rechaza un nombre vacío sin llamar a Supabase', async () => {
    await expect(editarProducto('p1', { ...datosValidos, nombre: '' })).rejects.toThrow(
      'El nombre del producto no puede estar vacío',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza una categoría vacía sin llamar a Supabase (la categoría es obligatoria)', async () => {
    await expect(editarProducto('p1', { ...datosValidos, categoria: '' })).rejects.toThrow(
      'Elegí una categoría para el producto',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga el error si la RLS rechaza el update', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('new row violates row-level security policy') });

    await expect(editarProducto('p1', datosValidos)).rejects.toThrow('new row violates row-level security policy');
  });
});

describe('eliminarProducto', () => {
  it('llama a delete().eq(\'id\', ...) con el id del producto', async () => {
    mockDeleteEq.mockResolvedValue({ error: null });

    await eliminarProducto('p1');

    expect(from).toHaveBeenCalledWith('productos');
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'p1');
  });

  it('propaga el error si falla el delete', async () => {
    mockDeleteEq.mockResolvedValue({ error: new Error('fallo de red') });

    await expect(eliminarProducto('p1')).rejects.toThrow('fallo de red');
  });
});

// Productos mínimos para los tests de las funciones puras de abajo (no
// hace falta el objeto completo, solo los campos que esas funciones leen).
function producto(datos: Partial<Producto>): Producto {
  return {
    id: 'p',
    hogar_id: 'hogar-1',
    nombre: '',
    categoria: null,
    unidad: 'unidad',
    cantidad: 0,
    stock_minimo: 0,
    fecha_vencimiento: null,
    alerta_vencimiento_habilitada: true,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...datos,
  };
}

describe('categoriasEnUso', () => {
  it('devuelve las categorías sin duplicados y ordenadas alfabéticamente', () => {
    const productos = [
      producto({ categoria: 'Bebidas' }),
      producto({ categoria: 'Lácteos' }),
      producto({ categoria: 'Bebidas' }),
      producto({ categoria: 'Carnes' }),
    ];

    expect(categoriasEnUso(productos)).toEqual(['Bebidas', 'Carnes', 'Lácteos']);
  });

  it('ignora productos sin categoría (null)', () => {
    const productos = [producto({ categoria: 'Bebidas' }), producto({ categoria: null })];

    expect(categoriasEnUso(productos)).toEqual(['Bebidas']);
  });

  it('devuelve un array vacío si no hay productos', () => {
    expect(categoriasEnUso([])).toEqual([]);
  });
});

describe('filtrarProductos', () => {
  const productos = [
    producto({ id: 'p1', nombre: 'Leche', categoria: 'Lácteos' }),
    producto({ id: 'p2', nombre: 'Yogur', categoria: 'Lácteos' }),
    producto({ id: 'p3', nombre: 'Manzana', categoria: 'Verduras y frutas' }),
  ];

  it('sin búsqueda ni categoría, devuelve todos los productos', () => {
    expect(filtrarProductos(productos, '', null)).toEqual(productos);
  });

  it('filtra por nombre sin distinguir mayúsculas/minúsculas', () => {
    expect(filtrarProductos(productos, 'LECHE', null)).toEqual([productos[0]]);
  });

  it('filtra por nombre con texto parcial', () => {
    expect(filtrarProductos(productos, 'man', null)).toEqual([productos[2]]);
  });

  it('recorta espacios alrededor del texto de búsqueda', () => {
    expect(filtrarProductos(productos, '  yogur  ', null)).toEqual([productos[1]]);
  });

  it('filtra por categoría exacta', () => {
    expect(filtrarProductos(productos, '', 'Lácteos')).toEqual([productos[0], productos[1]]);
  });

  it('combina búsqueda y categoría a la vez', () => {
    expect(filtrarProductos(productos, 'yogur', 'Lácteos')).toEqual([productos[1]]);
    expect(filtrarProductos(productos, 'yogur', 'Verduras y frutas')).toEqual([]);
  });

  it('devuelve un array vacío si ningún producto coincide', () => {
    expect(filtrarProductos(productos, 'queso', null)).toEqual([]);
  });
});

describe('parsearNumero', () => {
  it('parsea un número entero', () => {
    expect(parsearNumero('5')).toBe(5);
  });

  it('acepta coma como separador decimal', () => {
    expect(parsearNumero('1,5')).toBe(1.5);
  });

  it('acepta punto como separador decimal', () => {
    expect(parsearNumero('1.5')).toBe(1.5);
  });

  it('texto vacío se interpreta como 0', () => {
    expect(parsearNumero('')).toBe(0);
  });

  it('texto no numérico se interpreta como 0, no tira error', () => {
    expect(parsearNumero('abc')).toBe(0);
  });

  it('conserva números negativos (la validación de negativos vive en validar(), no acá)', () => {
    expect(parsearNumero('-3')).toBe(-3);
  });
});
