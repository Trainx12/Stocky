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
// listarProductosProximosAVencer encadena select('*').in().eq().not().order().
const mockInOrder = jest.fn();
const mockInNot = jest.fn(() => ({ order: mockInOrder }));
const mockInEq = jest.fn(() => ({ not: mockInNot }));
const mockSelectIn = jest.fn(() => ({ eq: mockInEq }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq, in: mockSelectIn }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete })),
    rpc: jest.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import {
  ajustarCantidadProducto,
  categoriasEnUso,
  crearProducto,
  editarProducto,
  eliminarProducto,
  estadoVencimiento,
  etiquetaVencimiento,
  filtrarProductos,
  diasDelMesCalendario,
  formatearFechaInput,
  formatearFechaISO,
  listarProductos,
  listarProductosProximosAVencer,
  parsearNumero,
  productosProximosAVencer,
} from './productos';
import type { DatosProducto } from './productos';
import type { Producto } from '../types/database';

const from = supabase.from as jest.Mock;
const rpc = supabase.rpc as jest.Mock;

const datosValidos: DatosProducto = {
  nombre: 'Leche',
  categoria: 'Lácteos',
  unidad: 'l',
  cantidad: 2,
  stockMinimo: 1,
  fechaVencimiento: null,
  alertaVencimientoHabilitada: true,
};

beforeEach(() => {
  from.mockClear();
  mockSelect.mockClear();
  mockSelectEq.mockClear();
  mockOrder.mockReset();
  mockSelectIn.mockClear();
  mockInEq.mockClear();
  mockInNot.mockClear();
  mockInOrder.mockReset();
  mockInsert.mockClear();
  mockInsertSelect.mockClear();
  mockUpdate.mockClear();
  mockUpdateEq.mockClear();
  mockUpdateSelect.mockClear();
  mockDelete.mockClear();
  mockDeleteEq.mockReset();
  mockSingle.mockReset();
  rpc.mockReset();
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
      fecha_vencimiento: null,
      alerta_vencimiento_habilitada: true,
    });
    expect(resultado).toEqual(producto);
  });

  it('pone en mayúscula la primera letra del nombre, sin tocar el resto', async () => {
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, nombre: 'mandarina Fina' });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ nombre: 'Mandarina Fina' }));
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

  it('rechaza una fecha de vencimiento con formato inválido sin llamar a Supabase', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, fechaVencimiento: '31/12/2026' })).rejects.toThrow(
      'La fecha de vencimiento no es válida (formato AAAA-MM-DD)',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('rechaza una fecha de vencimiento inexistente (ej: 30 de febrero) sin llamar a Supabase', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, fechaVencimiento: '2026-02-30' })).rejects.toThrow(
      'La fecha de vencimiento no es válida (formato AAAA-MM-DD)',
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('acepta una fecha de vencimiento válida y la manda tal cual', async () => {
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, fechaVencimiento: '2026-12-31' });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ fecha_vencimiento: '2026-12-31' }));
  });

  it('trata una fecha vacía o solo espacios como sin fecha (null)', async () => {
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, fechaVencimiento: '   ' });

    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ fecha_vencimiento: null }));
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
      fecha_vencimiento: null,
      alerta_vencimiento_habilitada: true,
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

  it('rechaza una fecha de vencimiento inválida sin llamar a Supabase', async () => {
    await expect(editarProducto('p1', { ...datosValidos, fechaVencimiento: '31/12/2026' })).rejects.toThrow(
      'La fecha de vencimiento no es válida (formato AAAA-MM-DD)',
    );
    expect(from).not.toHaveBeenCalled();
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

describe('ajustarCantidadProducto', () => {
  it('llama a la RPC ajustar_cantidad_producto con el producto y el delta, y devuelve el producto actualizado', async () => {
    const actualizado = { id: 'p1', nombre: 'Mandarina', cantidad: 2 };
    rpc.mockResolvedValue({ data: actualizado, error: null });

    const resultado = await ajustarCantidadProducto('p1', -1);

    expect(rpc).toHaveBeenCalledWith('ajustar_cantidad_producto', { p_producto_id: 'p1', p_delta: -1 });
    expect(resultado).toEqual(actualizado);
  });

  it('propaga el error si la RPC falla (ej: producto de otro hogar)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('No se encontró el producto (o no pertenece a tu hogar activo)') });

    await expect(ajustarCantidadProducto('p-ajeno', 1)).rejects.toThrow(
      'No se encontró el producto (o no pertenece a tu hogar activo)',
    );
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

describe('formatearFechaInput', () => {
  it('inserta el primer guion después de 4 dígitos', () => {
    expect(formatearFechaInput('20261')).toBe('2026-1');
  });

  it('inserta el segundo guion después de 6 dígitos', () => {
    expect(formatearFechaInput('2026102')).toBe('2026-10-2');
  });

  it('formatea una fecha completa de 8 dígitos', () => {
    expect(formatearFechaInput('20261025')).toBe('2026-10-25');
  });

  it('es idempotente: formatear una fecha ya formateada la deja igual', () => {
    expect(formatearFechaInput('2026-10-25')).toBe('2026-10-25');
  });

  it('ignora caracteres que no son dígitos (permite pegar con "/")', () => {
    expect(formatearFechaInput('2026/10/25')).toBe('2026-10-25');
  });

  it('trunca cualquier dígito de más allá del octavo', () => {
    expect(formatearFechaInput('202610259999')).toBe('2026-10-25');
  });

  it('texto vacío devuelve vacío', () => {
    expect(formatearFechaInput('')).toBe('');
  });

  it('al borrar el dígito justo después de un guion, el guion desaparece con él', () => {
    // Simula lo que recibe onChangeText cuando el usuario borra un carácter
    // del valor ya formateado "2026-1" (6 chars) -> queda "2026-" (5 chars).
    expect(formatearFechaInput('2026-')).toBe('2026');
  });
});

describe('formatearFechaISO', () => {
  it('formatea un Date a AAAA-MM-DD con ceros a la izquierda', () => {
    expect(formatearFechaISO(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('usa los componentes locales, no toISOString (evita el corrimiento de zona horaria)', () => {
    expect(formatearFechaISO(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
});

describe('diasDelMesCalendario', () => {
  it('devuelve siempre 42 días (6 semanas), sin importar el mes', () => {
    expect(diasDelMesCalendario(2026, 8)).toHaveLength(42); // septiembre, 30 días
    expect(diasDelMesCalendario(2026, 1)).toHaveLength(42); // febrero, 28 días
  });

  it('arranca la grilla un lunes', () => {
    const [primero] = diasDelMesCalendario(2026, 8);
    const [anio, mes, dia] = primero.fecha.split('-').map(Number);
    expect(new Date(anio, mes - 1, dia).getDay()).toBe(1); // 1 = lunes
  });

  it('incluye todos los días reales del mes marcados con enMesActual: true', () => {
    const dias = diasDelMesCalendario(2026, 8); // septiembre 2026, 30 días
    const delMes = dias.filter((d) => d.enMesActual);
    expect(delMes).toHaveLength(30);
    expect(delMes.map((d) => d.dia)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });

  it('rellena con días del mes anterior/siguiente marcados enMesActual: false', () => {
    const dias = diasDelMesCalendario(2026, 8);
    const relleno = dias.filter((d) => !d.enMesActual);
    expect(relleno.length).toBeGreaterThan(0);
    expect(relleno.length).toBe(42 - 30);
  });

  it('diciembre pasa el año al armar enero como relleno (no se rompe en el borde del año)', () => {
    const dias = diasDelMesCalendario(2026, 11); // diciembre 2026
    const ultimo = dias[dias.length - 1];
    // El último día de la grilla puede ser de enero de 2027 si diciembre
    // no completa la última semana -- lo importante es que no explote y
    // que la fecha siga siendo válida.
    expect(ultimo.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// "Hoy" fijo para no depender de la fecha real de cuando corren los tests.
const HOY = new Date(2026, 8, 15); // 2026-09-15

describe('estadoVencimiento', () => {
  it('devuelve null si no tiene fecha de vencimiento cargada', () => {
    expect(estadoVencimiento(producto({ fecha_vencimiento: null, alerta_vencimiento_habilitada: true }), HOY)).toBeNull();
  });

  it('devuelve null si la alerta está deshabilitada, aunque tenga fecha cargada', () => {
    expect(
      estadoVencimiento(producto({ fecha_vencimiento: '2026-09-16', alerta_vencimiento_habilitada: false }), HOY),
    ).toBeNull();
  });

  it('devuelve "vencido" si la fecha ya pasó', () => {
    expect(
      estadoVencimiento(producto({ fecha_vencimiento: '2026-09-14', alerta_vencimiento_habilitada: true }), HOY),
    ).toBe('vencido');
  });

  it('devuelve "proximo" (no "vencido") si la fecha es hoy mismo', () => {
    expect(
      estadoVencimiento(producto({ fecha_vencimiento: '2026-09-15', alerta_vencimiento_habilitada: true }), HOY),
    ).toBe('proximo');
  });

  it('devuelve "proximo" justo en el límite de la ventana (7 días)', () => {
    expect(
      estadoVencimiento(producto({ fecha_vencimiento: '2026-09-22', alerta_vencimiento_habilitada: true }), HOY),
    ).toBe('proximo');
  });

  it('devuelve "ok" un día después del límite de la ventana (8 días)', () => {
    expect(
      estadoVencimiento(producto({ fecha_vencimiento: '2026-09-23', alerta_vencimiento_habilitada: true }), HOY),
    ).toBe('ok');
  });

  it('devuelve "ok" para una fecha muy en el futuro', () => {
    expect(
      estadoVencimiento(producto({ fecha_vencimiento: '2027-01-01', alerta_vencimiento_habilitada: true }), HOY),
    ).toBe('ok');
  });
});

describe('etiquetaVencimiento', () => {
  it('devuelve null si estadoVencimiento devuelve null (sin fecha o alerta deshabilitada)', () => {
    expect(etiquetaVencimiento(producto({ fecha_vencimiento: null, alerta_vencimiento_habilitada: true }), HOY)).toBeNull();
    expect(
      etiquetaVencimiento(producto({ fecha_vencimiento: '2026-09-16', alerta_vencimiento_habilitada: false }), HOY),
    ).toBeNull();
  });

  it('"Vence hoy" cuando la fecha es hoy', () => {
    expect(etiquetaVencimiento(producto({ fecha_vencimiento: '2026-09-15', alerta_vencimiento_habilitada: true }), HOY)).toBe(
      'Vence hoy',
    );
  });

  it('"Vence mañana" cuando falta un día', () => {
    expect(etiquetaVencimiento(producto({ fecha_vencimiento: '2026-09-16', alerta_vencimiento_habilitada: true }), HOY)).toBe(
      'Vence mañana',
    );
  });

  it('"Vence en N días" para el resto de la ventana', () => {
    expect(etiquetaVencimiento(producto({ fecha_vencimiento: '2026-09-20', alerta_vencimiento_habilitada: true }), HOY)).toBe(
      'Vence en 5 días',
    );
  });

  it('"Vencido hace 1 día" en singular', () => {
    expect(etiquetaVencimiento(producto({ fecha_vencimiento: '2026-09-14', alerta_vencimiento_habilitada: true }), HOY)).toBe(
      'Vencido hace 1 día',
    );
  });

  it('"Vencido hace N días" en plural', () => {
    expect(etiquetaVencimiento(producto({ fecha_vencimiento: '2026-09-10', alerta_vencimiento_habilitada: true }), HOY)).toBe(
      'Vencido hace 5 días',
    );
  });
});

describe('productosProximosAVencer', () => {
  it('descarta los productos "ok" y los que no tienen alerta, y ordena por fecha ascendente', () => {
    const vencido = producto({ id: 'p1', fecha_vencimiento: '2026-09-10', alerta_vencimiento_habilitada: true });
    const proximo = producto({ id: 'p2', fecha_vencimiento: '2026-09-16', alerta_vencimiento_habilitada: true });
    const ok = producto({ id: 'p3', fecha_vencimiento: '2027-01-01', alerta_vencimiento_habilitada: true });
    const sinAlerta = producto({ id: 'p4', fecha_vencimiento: '2026-09-16', alerta_vencimiento_habilitada: false });
    const sinFecha = producto({ id: 'p5', fecha_vencimiento: null, alerta_vencimiento_habilitada: true });

    const resultado = productosProximosAVencer([ok, proximo, sinAlerta, vencido, sinFecha], HOY);

    expect(resultado).toEqual([vencido, proximo]);
  });

  it('devuelve un array vacío si ningún producto está próximo o vencido', () => {
    const ok = producto({ fecha_vencimiento: '2027-01-01', alerta_vencimiento_habilitada: true });
    expect(productosProximosAVencer([ok], HOY)).toEqual([]);
  });
});

describe('listarProductosProximosAVencer', () => {
  it('devuelve un array vacío sin consultar Supabase si no hay hogares', async () => {
    const resultado = await listarProductosProximosAVencer([]);

    expect(resultado).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('filtra explícitamente por los hogarIds recibidos (regresión: no debe apoyarse solo en RLS)', async () => {
    mockInOrder.mockResolvedValue({ data: [], error: null });

    await listarProductosProximosAVencer(['hogar-1', 'hogar-2']);

    expect(from).toHaveBeenCalledWith('productos');
    expect(mockSelectIn).toHaveBeenCalledWith('hogar_id', ['hogar-1', 'hogar-2']);
    expect(mockInEq).toHaveBeenCalledWith('alerta_vencimiento_habilitada', true);
    expect(mockInNot).toHaveBeenCalledWith('fecha_vencimiento', 'is', null);
  });

  it('aplica productosProximosAVencer sobre el resultado (descarta los "ok")', async () => {
    const vencido = producto({ id: 'p1', fecha_vencimiento: '2026-09-10', alerta_vencimiento_habilitada: true });
    const ok = producto({ id: 'p2', fecha_vencimiento: '2027-01-01', alerta_vencimiento_habilitada: true });
    mockInOrder.mockResolvedValue({ data: [ok, vencido], error: null });

    const resultado = await listarProductosProximosAVencer(['hogar-1']);

    expect(resultado).toEqual([vencido]);
  });

  it('propaga el error si falla la consulta', async () => {
    mockInOrder.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarProductosProximosAVencer(['hogar-1'])).rejects.toThrow('fallo de red');
  });
});
