/**
 * Tests de src/services/catalogo.ts. `listarCatalogoAprobado` encadena dos
 * `.order()` (categoria, nombre) y `listarSugerenciasPendientes` uno solo
 * (created_at) -- para no duplicar el mock de la cadena `.eq().order()`,
 * `chainable` se devuelve a sí mismo en `.order()` (soporta cualquier
 * cantidad de `.order()` encadenados) y expone `.then()` para poder
 * awaitearlo directo, resolviendo siempre a través de `mockOrderResolved`.
 */
const mockOrderResolved = jest.fn();
interface Chainable {
  order: jest.Mock<Chainable, unknown[]>;
  then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => void;
}
const mockOrder: jest.Mock<Chainable, unknown[]> = jest.fn(() => chainable);
const chainable: Chainable = {
  order: mockOrder,
  then: (resolve, reject) => mockOrderResolved().then(resolve, reject),
};
const mockEq = jest.fn(() => chainable);
const mockSelect = jest.fn(() => ({ eq: mockEq }));

const mockSingle = jest.fn();
const mockInsertSelect = jest.fn(() => ({ single: mockSingle }));
const mockInsert = jest.fn(() => ({ select: mockInsertSelect }));

const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));

const mockDeleteEq = jest.fn();
const mockDelete = jest.fn(() => ({ eq: mockDeleteEq }));

// Storage (fotos de las sugerencias).
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockGetPublicUrl = jest.fn((ruta: string) => ({
  data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/${ruta}` },
}));
const mockStorageFrom = jest.fn((_bucket: string) => ({ upload: mockUpload, remove: mockRemove, getPublicUrl: mockGetPublicUrl }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete })),
    auth: { getUser: jest.fn() },
    storage: { from: (bucket: string) => mockStorageFrom(bucket) },
  },
}));

import { supabase } from '../lib/supabase';
import {
  categoriasDelCatalogo,
  filtrarCatalogo,
  listarCatalogoAprobado,
  listarSugerenciasPendientes,
  responderSugerencia,
  rutaDeFotoSugerencia,
  sugerirProducto,
} from './catalogo';
import type { DatosSugerencia } from './catalogo';
import type { ProductoCatalogo } from '../types/database';

const from = supabase.from as jest.Mock;
const getUser = supabase.auth.getUser as jest.Mock;

const datosValidos: DatosSugerencia = {
  nombre: 'Leche de Almendras',
  categoria: 'Lácteos',
  unidad: 'l',
};

beforeEach(() => {
  from.mockClear();
  mockStorageFrom.mockClear();
  mockUpload.mockReset();
  mockRemove.mockReset();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockOrder.mockClear();
  mockOrderResolved.mockReset();
  mockInsert.mockClear();
  mockInsertSelect.mockClear();
  mockSingle.mockReset();
  mockUpdate.mockClear();
  mockUpdateEq.mockReset();
  mockDelete.mockClear();
  mockDeleteEq.mockReset();
  getUser.mockReset();
});

describe('listarCatalogoAprobado', () => {
  it('filtra por estado=aprobado y ordena por categoría y nombre', async () => {
    mockOrderResolved.mockResolvedValue({ data: [], error: null });

    await listarCatalogoAprobado();

    expect(from).toHaveBeenCalledWith('productos_catalogo');
    expect(mockEq).toHaveBeenCalledWith('estado', 'aprobado');
    expect(mockOrder).toHaveBeenCalledWith('categoria', { ascending: true });
    expect(mockOrder).toHaveBeenCalledWith('nombre', { ascending: true });
  });

  it('devuelve la lista del catálogo', async () => {
    const catalogo = [{ id: 'c1', nombre: 'Leche', categoria: 'Lácteos' }];
    mockOrderResolved.mockResolvedValue({ data: catalogo, error: null });

    const resultado = await listarCatalogoAprobado();

    expect(resultado).toEqual(catalogo);
  });

  it('devuelve un array vacío si data es null', async () => {
    mockOrderResolved.mockResolvedValue({ data: null, error: null });

    const resultado = await listarCatalogoAprobado();

    expect(resultado).toEqual([]);
  });

  it('propaga el error si falla la consulta', async () => {
    mockOrderResolved.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarCatalogoAprobado()).rejects.toThrow('fallo de red');
  });
});

describe('sugerirProducto', () => {
  it('inserta la sugerencia recortando nombre/categoría, en estado pendiente y a nombre del usuario logueado', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    const sugerencia = { id: 's1', nombre: 'Leche de Almendras', categoria: 'Lácteos', unidad: 'l', estado: 'pendiente' };
    mockSingle.mockResolvedValue({ data: sugerencia, error: null });

    const resultado = await sugerirProducto({ ...datosValidos, nombre: '  Leche de Almendras  ', categoria: '  Lácteos  ' });

    expect(from).toHaveBeenCalledWith('productos_catalogo');
    expect(mockInsert).toHaveBeenCalledWith({
      nombre: 'Leche de Almendras',
      categoria: 'Lácteos',
      unidad: 'l',
      estado: 'pendiente',
      sugerido_por: 'user-123',
    });
    expect(resultado).toEqual(sugerencia);
  });

  it('rechaza un nombre vacío sin llamar a Supabase', async () => {
    await expect(sugerirProducto({ ...datosValidos, nombre: '   ' })).rejects.toThrow('El nombre del producto no puede estar vacío');
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza una categoría vacía sin llamar a Supabase', async () => {
    await expect(sugerirProducto({ ...datosValidos, categoria: '   ' })).rejects.toThrow('Elegí una categoría para el producto');
    expect(from).not.toHaveBeenCalled();
  });

  it('falla sin consultar la tabla si no hay usuario logueado', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    await expect(sugerirProducto(datosValidos)).rejects.toThrow('No se pudo identificar al usuario logueado');
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga el error si la RLS rechaza el insert', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockSingle.mockResolvedValue({ data: null, error: new Error('duplicate key value violates unique constraint') });

    await expect(sugerirProducto(datosValidos)).rejects.toThrow('duplicate key value violates unique constraint');
  });
});

describe('listarSugerenciasPendientes', () => {
  it('filtra por estado=pendiente y ordena por fecha de creación', async () => {
    mockOrderResolved.mockResolvedValue({ data: [], error: null });

    await listarSugerenciasPendientes();

    expect(from).toHaveBeenCalledWith('productos_catalogo');
    expect(mockEq).toHaveBeenCalledWith('estado', 'pendiente');
    expect(mockOrder).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('devuelve un array vacío si data es null', async () => {
    mockOrderResolved.mockResolvedValue({ data: null, error: null });

    const resultado = await listarSugerenciasPendientes();

    expect(resultado).toEqual([]);
  });

  it('propaga el error si falla la consulta', async () => {
    mockOrderResolved.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarSugerenciasPendientes()).rejects.toThrow('fallo de red');
  });
});

describe('sugerirProducto con foto', () => {
  // "hola" en base64.
  const foto = 'aG9sYQ==';

  it('sube la foto a la carpeta del usuario y guarda su URL en la sugerencia', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockSingle.mockResolvedValue({ data: { id: 's1' }, error: null });

    await sugerirProducto({ ...datosValidos, fotoBase64: foto });

    expect(mockStorageFrom).toHaveBeenCalledWith('catalogo-sugerencias');
    const [ruta, bytes, opciones] = mockUpload.mock.calls[0];
    expect(ruta).toMatch(/^user-123\/\d+\.jpg$/);
    expect(Array.from(bytes as Uint8Array)).toEqual([104, 111, 108, 97]);
    expect(opciones).toEqual({ contentType: 'image/jpeg' });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ imagen_url: expect.stringContaining('/catalogo-sugerencias/user-123/') }),
    );
  });

  it('si falla la subida no crea la sugerencia', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockUpload.mockResolvedValue({ error: new Error('Payload too large') });

    await expect(sugerirProducto({ ...datosValidos, fotoBase64: foto })).rejects.toThrow('No se pudo subir la foto');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('si falla el alta, borra la foto ya subida', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });
    mockSingle.mockResolvedValue({ data: null, error: new Error('duplicate key') });

    await expect(sugerirProducto({ ...datosValidos, fotoBase64: foto })).rejects.toThrow('duplicate key');
    expect(mockRemove).toHaveBeenCalledWith([expect.stringMatching(/^user-123\/\d+\.jpg$/)]);
  });
});

describe('rutaDeFotoSugerencia', () => {
  it('saca la ruta dentro del bucket de una URL pública', () => {
    expect(rutaDeFotoSugerencia('https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/u1/123.jpg')).toBe(
      'u1/123.jpg',
    );
  });

  it('ignora URLs que no son del bucket de sugerencias', () => {
    expect(rutaDeFotoSugerencia('https://images.openfoodfacts.org/foto.jpg')).toBeNull();
    expect(rutaDeFotoSugerencia(null)).toBeNull();
  });
});

describe('responderSugerencia', () => {
  it('al rechazar, borra también la foto de la sugerencia', async () => {
    mockDeleteEq.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ error: null });

    await responderSugerencia('s1', false, 'https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/u1/1.jpg');

    expect(mockRemove).toHaveBeenCalledWith(['u1/1.jpg']);
  });

  it('al aprobar, la foto se queda (pasa a ser la del catálogo)', async () => {
    mockUpdateEq.mockResolvedValue({ error: null });

    await responderSugerencia('s1', true, 'https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/u1/1.jpg');

    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('al aprobar, actualiza el estado a aprobado', async () => {
    mockUpdateEq.mockResolvedValue({ error: null });

    await responderSugerencia('s1', true);

    expect(from).toHaveBeenCalledWith('productos_catalogo');
    expect(mockUpdate).toHaveBeenCalledWith({ estado: 'aprobado' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 's1');
  });

  it('al rechazar, borra la fila', async () => {
    mockDeleteEq.mockResolvedValue({ error: null });

    await responderSugerencia('s1', false);

    expect(from).toHaveBeenCalledWith('productos_catalogo');
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 's1');
  });

  it('propaga el error si la RLS rechaza el update (ej: quien llama no es admin)', async () => {
    mockUpdateEq.mockResolvedValue({ error: new Error('new row violates row-level security policy') });

    await expect(responderSugerencia('s1', true)).rejects.toThrow('new row violates row-level security policy');
  });

  it('propaga el error si la RLS rechaza el delete', async () => {
    mockDeleteEq.mockResolvedValue({ error: new Error('new row violates row-level security policy') });

    await expect(responderSugerencia('s1', false)).rejects.toThrow('new row violates row-level security policy');
  });
});

// Filas mínimas para los tests de las funciones puras de abajo.
function producto(datos: Partial<ProductoCatalogo>): ProductoCatalogo {
  return {
    id: 'c',
    nombre: '',
    categoria: 'Otros',
    unidad: 'unidad',
    imagen_url: null,
    estado: 'aprobado',
    sugerido_por: null,
    created_at: '2026-01-01',
    ...datos,
  };
}

describe('categoriasDelCatalogo', () => {
  it('devuelve las categorías sin duplicados y ordenadas alfabéticamente', () => {
    const catalogo = [
      producto({ categoria: 'Bebidas' }),
      producto({ categoria: 'Lácteos' }),
      producto({ categoria: 'Bebidas' }),
      producto({ categoria: 'Otros' }),
    ];

    expect(categoriasDelCatalogo(catalogo)).toEqual(['Bebidas', 'Lácteos', 'Otros']);
  });

  it('devuelve un array vacío si el catálogo está vacío', () => {
    expect(categoriasDelCatalogo([])).toEqual([]);
  });
});

describe('filtrarCatalogo', () => {
  const catalogo = [
    producto({ id: 'c1', nombre: 'Leche', categoria: 'Lácteos' }),
    producto({ id: 'c2', nombre: 'Yogur', categoria: 'Lácteos' }),
    producto({ id: 'c3', nombre: 'Manzana', categoria: 'Verduras y frutas' }),
  ];

  it('sin búsqueda ni categoría, devuelve todo el catálogo', () => {
    expect(filtrarCatalogo(catalogo, '', null)).toEqual(catalogo);
  });

  it('filtra por nombre sin distinguir mayúsculas/minúsculas', () => {
    expect(filtrarCatalogo(catalogo, 'LECHE', null)).toEqual([catalogo[0]]);
  });

  it('filtra por categoría exacta', () => {
    expect(filtrarCatalogo(catalogo, '', 'Lácteos')).toEqual([catalogo[0], catalogo[1]]);
  });

  it('combina búsqueda y categoría a la vez', () => {
    expect(filtrarCatalogo(catalogo, 'yogur', 'Lácteos')).toEqual([catalogo[1]]);
    expect(filtrarCatalogo(catalogo, 'yogur', 'Verduras y frutas')).toEqual([]);
  });

  it('devuelve un array vacío si ningún producto coincide', () => {
    expect(filtrarCatalogo(catalogo, 'queso', null)).toEqual([]);
  });
});
