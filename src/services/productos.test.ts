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
// listarProductosConStockBajo encadena select('*').in().order().
const mockSelectIn = jest.fn(() => ({ eq: mockInEq, order: mockInOrder }));
const mockSelect = jest.fn(() => ({ eq: mockSelectEq, in: mockSelectIn }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({ select: mockSelect, insert: mockInsert, update: mockUpdate, delete: mockDelete })),
    rpc: jest.fn(),
  },
}));

import { supabase } from '../lib/supabase';
import {
  avisoProductoVencido,
  productosVencidos,
  agruparProductos,
  ajustarCantidadProducto,
  buscarDuplicado,
  categoriasEnUso,
  ajustarDiasAviso,
  crearProducto,
  diasAvisoDe,
  esDiasAvisoValido,
  parsearDiasAviso,
  editarProducto,
  eliminarProducto,
  eliminarProductosAgotados,
  estadoStock,
  estadoStockDeGrupo,
  estadoVencimiento,
  etiquetaStock,
  etiquetaVencimiento,
  filtrarProductos,
  diasDelMesCalendario,
  formatearFechaInput,
  formatearFechaCorta,
  formatearFechaISO,
  listarProductos,
  listarProductosConStockBajo,
  listarProductosProximosAVencer,
  nombreConMarca,
  ordenarLotes,
  parsearNumero,
  productosAgotadosLimpiables,
  productosConStockBajo,
  productosConVencimiento,
  productosProximosAVencer,
  stockMinimoDelGrupo,
  textoVerTodos,
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
  catalogoId: 'cat-1',
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
  // crearProducto consulta primero los productos del hogar (para unir
  // duplicados): por defecto el hogar está vacío.
  beforeEach(() => {
    mockOrder.mockResolvedValue({ data: [], error: null });
  });

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
      catalogo_id: 'cat-1',
      marca: null,
      dias_aviso_vencimiento: null,
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
      marca: null,
      dias_aviso_vencimiento: null,
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
    catalogo_id: null,
    marca: null,
    dias_aviso_vencimiento: null,
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

describe('agruparProductos', () => {
  it('junta los lotes del mismo producto y suma la cantidad', () => {
    const grupos = agruparProductos([
      producto({ id: 'm1', nombre: 'Manzana', unidad: 'unidad', cantidad: 3, marca: 'Red Premium', fecha_vencimiento: '2026-10-07' }),
      producto({ id: 'm2', nombre: 'manzana', unidad: 'unidad', cantidad: 3, marca: null, fecha_vencimiento: '2026-10-20' }),
      producto({ id: 'y1', nombre: 'Yogur', unidad: 'unidad', cantidad: 1 }),
    ]);

    expect(grupos.map((g) => [g.nombre, g.cantidadTotal, g.lotes.map((l) => l.id)])).toEqual([
      ['Manzana', 6, ['m1', 'm2']],
      ['Yogur', 1, ['y1']],
    ]);
  });

  it('ordena los lotes por vencimiento, los sin fecha al final', () => {
    const [grupo] = agruparProductos([
      producto({ id: 'sin-fecha', nombre: 'Leche', fecha_vencimiento: null }),
      producto({ id: 'tarde', nombre: 'Leche', fecha_vencimiento: '2026-12-01' }),
      producto({ id: 'pronto', nombre: 'Leche', fecha_vencimiento: '2026-10-10' }),
    ]);

    expect(grupo.lotes.map((l) => l.id)).toEqual(['pronto', 'tarde', 'sin-fecha']);
  });

  it('no mezcla el mismo producto en unidades distintas', () => {
    const grupos = agruparProductos([
      producto({ nombre: 'Papa', unidad: 'kg', cantidad: 2 }),
      producto({ nombre: 'Papa', unidad: 'paquete', cantidad: 1 }),
    ]);

    expect(grupos).toHaveLength(2);
  });

  it('suma decimales sin errores de coma flotante', () => {
    const [grupo] = agruparProductos([
      producto({ nombre: 'Agua', unidad: 'l', cantidad: 0.1 }),
      producto({ nombre: 'Agua', unidad: 'l', cantidad: 0.2 }),
    ]);

    expect(grupo.cantidadTotal).toBe(0.3);
  });
});

describe('ordenarLotes', () => {
  it('pone primero lo que vence antes y, a igual fecha, los que tienen marca', () => {
    const lotes = [
      producto({ id: 'sin-fecha', fecha_vencimiento: null }),
      producto({ id: 'pronto-sin-marca', fecha_vencimiento: '2026-10-07', marca: null }),
      producto({ id: 'tarde', fecha_vencimiento: '2026-11-01' }),
      producto({ id: 'pronto-con-marca', fecha_vencimiento: '2026-10-07', marca: 'Red Premium' }),
    ];

    expect(ordenarLotes(lotes).map((l) => l.id)).toEqual(['pronto-con-marca', 'pronto-sin-marca', 'tarde', 'sin-fecha']);
  });

  it('no modifica la lista original', () => {
    const lotes = [producto({ id: 'b', fecha_vencimiento: '2026-12-01' }), producto({ id: 'a', fecha_vencimiento: '2026-10-01' })];
    ordenarLotes(lotes);
    expect(lotes.map((l) => l.id)).toEqual(['b', 'a']);
  });
});

describe('formatearFechaCorta', () => {
  it('muestra la fecha como DD/MM/AAAA', () => {
    expect(formatearFechaCorta('2026-10-07')).toBe('07/10/2026');
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

  it('también busca por marca', () => {
    const conMarca = [...productos, producto({ id: 'p4', nombre: 'Manzana', marca: 'Red Premium' })];
    expect(filtrarProductos(conMarca, 'red prem', null).map((p) => p.id)).toEqual(['p4']);
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

describe('unir duplicados al crear', () => {
  const existente = producto({ id: 'p-existente', catalogo_id: 'cat-1', nombre: 'Leche', unidad: 'l', cantidad: 2, marca: 'La Serenísima' });

  it('suma la cantidad al producto idéntico en vez de crear otra fila', async () => {
    mockOrder.mockResolvedValue({ data: [existente], error: null });
    rpc.mockResolvedValue({ data: { ...existente, cantidad: 5 }, error: null });

    const resultado = await crearProducto('hogar-1', { ...datosValidos, cantidad: 3, marca: ' la serenisima ' });

    expect(rpc).toHaveBeenCalledWith('ajustar_cantidad_producto', { p_producto_id: 'p-existente', p_delta: 3 });
    expect(mockInsert).not.toHaveBeenCalled();
    expect(resultado.cantidad).toBe(5);
  });

  it('crea otra fila si la marca es distinta', async () => {
    mockOrder.mockResolvedValue({ data: [existente], error: null });
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, marca: 'Sancor' });

    expect(rpc).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ marca: 'Sancor' }));
  });

  it('crea otra fila si el vencimiento es distinto', async () => {
    mockOrder.mockResolvedValue({ data: [{ ...existente, fecha_vencimiento: '2026-12-01' }], error: null });
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, marca: 'La Serenísima', fechaVencimiento: '2026-12-15' });

    expect(mockInsert).toHaveBeenCalled();
  });

  it('con cantidad 0 no busca duplicados', async () => {
    mockSingle.mockResolvedValue({ data: {}, error: null });

    await crearProducto('hogar-1', { ...datosValidos, cantidad: 0 });

    expect(mockSelectEq).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalled();
  });

  it('rechaza una marca de más de 40 caracteres', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, marca: 'x'.repeat(41) })).rejects.toThrow('40 caracteres');
  });
});

describe('buscarDuplicado', () => {
  it('sin catálogo, compara por nombre normalizado', () => {
    const p = producto({ id: 'a', nombre: 'Tortuguita', catalogo_id: null });
    expect(
      buscarDuplicado([p], { nombre: 'tortuguita ', catalogoId: null, unidad: p.unidad, marca: null, fechaVencimiento: null }),
    ).toBe(p);
  });

  it('no mezcla un producto de catálogo con uno sin catálogo', () => {
    const p = producto({ id: 'a', nombre: 'Leche', catalogo_id: null });
    expect(
      buscarDuplicado([p], { nombre: 'Leche', catalogoId: 'cat-1', unidad: p.unidad, marca: null, fechaVencimiento: null }),
    ).toBeNull();
  });

  // incidentes-sprint10.md #22: chocolatada líquida (l) y en polvo (paquete).
  it('no junta el mismo producto en otra unidad', () => {
    const liquida = producto({ id: 'a', nombre: 'Chocolatada', catalogo_id: 'cat-choco', unidad: 'l' });
    const nuevo = { nombre: 'Chocolatada', catalogoId: 'cat-choco', marca: null, fechaVencimiento: null };
    expect(buscarDuplicado([liquida], { ...nuevo, unidad: 'paquete' })).toBeNull();
    expect(buscarDuplicado([liquida], { ...nuevo, unidad: 'l' })).toBe(liquida);
  });
});

describe('nombreConMarca', () => {
  it('agrega la marca solo si existe', () => {
    expect(nombreConMarca({ nombre: 'Fideos', marca: 'Lucchetti' })).toBe('Fideos · Lucchetti');
    expect(nombreConMarca({ nombre: 'Fideos', marca: null })).toBe('Fideos');
  });
});

describe('productosAgotadosLimpiables', () => {
  it('solo los de cantidad 0 sin stock mínimo (los que tienen mínimo son señal de reposición)', () => {
    const lista = [
      producto({ id: 'a', cantidad: 0, stock_minimo: 0 }),
      producto({ id: 'b', cantidad: 0, stock_minimo: 2 }),
      producto({ id: 'c', cantidad: 3, stock_minimo: 0 }),
    ];
    expect(productosAgotadosLimpiables(lista).map((p) => p.id)).toEqual(['a']);
  });
});

describe('eliminarProductosAgotados', () => {
  it('borra por hogar con cantidad 0 y stock mínimo 0 y devuelve cuántos borró', async () => {
    const mockSelectIds = jest.fn().mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null });
    const eqStock = jest.fn(() => ({ select: mockSelectIds }));
    const eqCantidad = jest.fn(() => ({ eq: eqStock }));
    mockDeleteEq.mockReturnValue({ eq: eqCantidad });

    const borrados = await eliminarProductosAgotados('hogar-1');

    expect(mockDeleteEq).toHaveBeenCalledWith('hogar_id', 'hogar-1');
    expect(eqCantidad).toHaveBeenCalledWith('cantidad', 0);
    expect(eqStock).toHaveBeenCalledWith('stock_minimo', 0);
    expect(borrados).toBe(2);
  });
});

describe('estadoStock', () => {
  // Plan de testing, Sprint 8: el valor exacto, uno arriba y uno abajo.
  it('con el valor justo en el mínimo no hay alerta (es estricto: "por debajo")', () => {
    expect(estadoStock(3, 3)).toBeNull();
  });

  it('uno arriba del mínimo no hay alerta', () => {
    expect(estadoStock(4, 3)).toBeNull();
  });

  it('uno abajo del mínimo es "bajo"', () => {
    expect(estadoStock(2, 3)).toBe('bajo');
  });

  it('funciona con decimales (0,4 kg con mínimo 0,5 kg)', () => {
    expect(estadoStock(0.4, 0.5)).toBe('bajo');
    expect(estadoStock(0.5, 0.5)).toBeNull();
  });

  it('cantidad 0 con mínimo cargado es "agotado"', () => {
    expect(estadoStock(0, 3)).toBe('agotado');
  });

  it('sin mínimo cargado nunca alerta, ni siquiera agotado', () => {
    expect(estadoStock(0, 0)).toBeNull();
    expect(estadoStock(5, 0)).toBeNull();
  });
});

describe('stockMinimoDelGrupo / estadoStockDeGrupo', () => {
  it('toma el mínimo más exigente entre los lotes', () => {
    const lotes = [producto({ stock_minimo: 0 }), producto({ stock_minimo: 3 }), producto({ stock_minimo: 2 })];
    expect(stockMinimoDelGrupo({ lotes })).toBe(3);
  });

  it('compara el TOTAL de los lotes contra el mínimo, no cada lote suelto', () => {
    const lotes = [producto({ cantidad: 1, stock_minimo: 3 }), producto({ cantidad: 4, stock_minimo: 0 })];
    expect(estadoStockDeGrupo({ lotes, cantidadTotal: 5 })).toBeNull();
    expect(estadoStockDeGrupo({ lotes, cantidadTotal: 2 })).toBe('bajo');
  });
});

describe('etiquetaStock', () => {
  it('arma el texto de cada estado', () => {
    expect(etiquetaStock('agotado', 3)).toBe('Sin stock');
    expect(etiquetaStock('bajo', 3)).toBe('Stock bajo (mín. 3)');
    expect(etiquetaStock(null, 3)).toBeNull();
  });
});

describe('productosConStockBajo', () => {
  it('agrupa por hogar y producto, y pone primero lo más urgente', () => {
    const lista = [
      producto({ id: 'a', hogar_id: 'h1', nombre: 'Leche', unidad: 'l', cantidad: 1, stock_minimo: 2 }),
      producto({ id: 'b', hogar_id: 'h1', nombre: 'Leche', unidad: 'l', cantidad: 3, stock_minimo: 0 }),
      producto({ id: 'c', hogar_id: 'h1', nombre: 'Huevos', unidad: 'unidad', cantidad: 2, stock_minimo: 12 }),
      producto({ id: 'd', hogar_id: 'h2', nombre: 'Leche', unidad: 'l', cantidad: 0, stock_minimo: 1 }),
      producto({ id: 'e', hogar_id: 'h2', nombre: 'Pan', unidad: 'unidad', cantidad: 0, stock_minimo: 0 }),
    ];

    const resultado = productosConStockBajo(lista);

    // Leche de h1 suma 4 >= 2: sin alerta. Pan sin mínimo: sin alerta.
    expect(resultado.map((a) => [a.hogarId, a.nombre, a.estado])).toEqual([
      ['h2', 'Leche', 'agotado'],
      ['h1', 'Huevos', 'bajo'],
    ]);
    expect(resultado[1]).toMatchObject({ cantidadTotal: 2, stockMinimo: 12, unidad: 'unidad' });
  });

  it('devuelve [] si nada está por debajo del mínimo', () => {
    expect(productosConStockBajo([producto({ cantidad: 5, stock_minimo: 2 })])).toEqual([]);
  });
});

describe('listarProductosConStockBajo', () => {
  it('no consulta Supabase si no hay hogares', async () => {
    await expect(listarProductosConStockBajo([])).resolves.toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('filtra explícitamente por los hogarIds recibidos (no solo RLS) y calcula las alertas', async () => {
    mockInOrder.mockResolvedValue({
      data: [producto({ hogar_id: 'hogar-1', nombre: 'Yerba', cantidad: 0, stock_minimo: 1 })],
      error: null,
    });

    const resultado = await listarProductosConStockBajo(['hogar-1', 'hogar-2']);

    expect(from).toHaveBeenCalledWith('productos');
    expect(mockSelectIn).toHaveBeenCalledWith('hogar_id', ['hogar-1', 'hogar-2']);
    expect(resultado.map((a) => a.nombre)).toEqual(['Yerba']);
  });

  it('propaga el error si falla la consulta', async () => {
    mockInOrder.mockResolvedValue({ data: null, error: new Error('fallo de red') });
    await expect(listarProductosConStockBajo(['hogar-1'])).rejects.toThrow('fallo de red');
  });
});

describe('productosConVencimiento', () => {
  it('incluye todos los que tienen fecha (vencidos, próximos, lejanos y con alerta apagada) en orden de vencimiento', () => {
    const lejano = producto({ id: 'lejano', nombre: 'Arroz', fecha_vencimiento: '2027-05-01' });
    const vencido = producto({ id: 'vencido', nombre: 'Yogur', fecha_vencimiento: '2026-09-01' });
    const sinAlerta = producto({ id: 'sinAlerta', nombre: 'Queso', fecha_vencimiento: '2026-10-20', alerta_vencimiento_habilitada: false });
    const proximo = producto({ id: 'proximo', nombre: 'Leche', fecha_vencimiento: '2026-09-16' });
    const sinFecha = producto({ id: 'sinFecha', nombre: 'Sal', fecha_vencimiento: null });

    const resultado = productosConVencimiento([lejano, sinFecha, sinAlerta, vencido, proximo]);

    expect(resultado.map((p) => p.id)).toEqual(['vencido', 'proximo', 'sinAlerta', 'lejano']);
  });

  it('a igual fecha ordena por nombre y no modifica la lista original', () => {
    const lista = [
      producto({ id: 'b', nombre: 'Manteca', fecha_vencimiento: '2026-10-01' }),
      producto({ id: 'a', nombre: 'Crema', fecha_vencimiento: '2026-10-01' }),
    ];
    expect(productosConVencimiento(lista).map((p) => p.id)).toEqual(['a', 'b']);
    expect(lista.map((p) => p.id)).toEqual(['b', 'a']);
  });
});

describe('días de aviso de vencimiento (Sprint 10)', () => {
  it('esDiasAvisoValido: enteros entre 1 y 60', () => {
    expect(esDiasAvisoValido(1)).toBe(true);
    expect(esDiasAvisoValido(60)).toBe(true);
    expect(esDiasAvisoValido(0)).toBe(false);
    expect(esDiasAvisoValido(61)).toBe(false);
    expect(esDiasAvisoValido(2.5)).toBe(false);
    expect(esDiasAvisoValido(NaN)).toBe(false);
  });

  it('parsearDiasAviso: vacío = null (usar la general), el resto como número', () => {
    expect(parsearDiasAviso('')).toBeNull();
    expect(parsearDiasAviso('  ')).toBeNull();
    expect(parsearDiasAviso('3')).toBe(3);
    expect(parsearDiasAviso('0')).toBe(0);
  });

  it('diasAvisoDe: el del producto pisa la preferencia general', () => {
    expect(diasAvisoDe({ dias_aviso_vencimiento: 2 }, 10)).toBe(2);
    expect(diasAvisoDe({ dias_aviso_vencimiento: null }, 10)).toBe(10);
    expect(diasAvisoDe({}, undefined)).toBe(7);
  });

  it('estadoVencimiento usa los días del producto o los generales', () => {
    // HOY = 15/09/2026; vence el 25/09 -> faltan 10 días.
    const enDiez = producto({ fecha_vencimiento: '2026-09-25' });
    expect(estadoVencimiento(enDiez, HOY)).toBe('ok'); // default 7
    expect(estadoVencimiento(enDiez, HOY, 10)).toBe('proximo'); // general 10
    expect(estadoVencimiento({ ...enDiez, dias_aviso_vencimiento: 3 }, HOY, 30)).toBe('ok'); // propio 3 pisa 30
    expect(etiquetaVencimiento(enDiez, HOY, 10)).toBe('Vence en 10 días');
  });

  it('productosProximosAVencer respeta la preferencia general', () => {
    const enDiez = producto({ id: 'p', fecha_vencimiento: '2026-09-25' });
    expect(productosProximosAVencer([enDiez], HOY)).toEqual([]);
    expect(productosProximosAVencer([enDiez], HOY, 15)).toEqual([enDiez]);
  });

  it('crearProducto rechaza días fuera de rango sin consultar Supabase', async () => {
    await expect(crearProducto('hogar-1', { ...datosValidos, diasAvisoVencimiento: 0 })).rejects.toThrow('entre 1 y 60');
    await expect(crearProducto('hogar-1', { ...datosValidos, diasAvisoVencimiento: 99 })).rejects.toThrow('entre 1 y 60');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('editarProducto guarda los días propios del producto', async () => {
    mockSingle.mockResolvedValue({ data: producto({ id: 'p1' }), error: null });
    await editarProducto('p1', { ...datosValidos, diasAvisoVencimiento: 3 });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ dias_aviso_vencimiento: 3 }));
  });
});

describe('textoVerTodos', () => {
  it('con varios hogares nombra a cuál lleva', () => {
    expect(textoVerTodos(2, 'Casa', 4)).toBe('Ver todos en Casa');
  });

  it('con un solo hogar muestra el total solo si no entran todas', () => {
    expect(textoVerTodos(7, null, 4)).toBe('Ver todos (7)');
    expect(textoVerTodos(4, null, 4)).toBe('Ver en la despensa');
  });
});

describe('ajustarDiasAviso', () => {
  it('suma o resta dentro del rango 1-60', () => {
    expect(ajustarDiasAviso(7, 1)).toBe(8);
    expect(ajustarDiasAviso(7, -1)).toBe(6);
  });

  it('no baja de 1 ni sube de 60', () => {
    expect(ajustarDiasAviso(1, -1)).toBe(1);
    expect(ajustarDiasAviso(60, 1)).toBe(60);
  });
});

describe('avisoProductoVencido', () => {
  const HOY_AVISO = new Date(2026, 9, 22, 15, 0);

  it('frena una fecha que ya pasó, con un aviso de salud', () => {
    const aviso = avisoProductoVencido('2026-10-21', null, HOY_AVISO);
    expect(aviso).toContain('venció el 21/10/2026');
    expect(aviso).toContain('Por tu salud');
  });

  it('deja cargar lo que vence hoy o más adelante, y sin fecha', () => {
    expect(avisoProductoVencido('2026-10-22', null, HOY_AVISO)).toBeNull();
    expect(avisoProductoVencido('2027-01-01', null, HOY_AVISO)).toBeNull();
    expect(avisoProductoVencido('', null, HOY_AVISO)).toBeNull();
    expect(avisoProductoVencido(null, null, HOY_AVISO)).toBeNull();
  });

  it('editar un producto que ya estaba vencido sin tocar la fecha se permite', () => {
    expect(avisoProductoVencido('2026-10-01', '2026-10-01', HOY_AVISO)).toBeNull();
    expect(avisoProductoVencido('2026-09-30', '2026-10-01', HOY_AVISO)).not.toBeNull();
  });
});

describe('crearProducto con fecha vencida', () => {
  it('no llega a la base', async () => {
    from.mockClear();
    await expect(crearProducto('h1', { ...datosValidos, fechaVencimiento: '2020-01-01' })).rejects.toThrow('Por tu salud');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('etiquetaVencimiento (semáforo: también lo que está bien)', () => {
  const HOY_SEMAFORO = new Date(2026, 9, 22, 10, 0);
  const conFecha = (fecha: string) =>
    ({ fecha_vencimiento: fecha, alerta_vencimiento_habilitada: true, dias_aviso_vencimiento: null }) as const;

  it('si falta más que los días de aviso, igual dice cuánto falta (badge verde)', () => {
    expect(estadoVencimiento(conFecha('2026-11-11'), HOY_SEMAFORO)).toBe('ok');
    expect(etiquetaVencimiento(conFecha('2026-11-11'), HOY_SEMAFORO)).toBe('Vence en 20 días');
  });

  it('si falta mucho, muestra la fecha', () => {
    expect(etiquetaVencimiento(conFecha('2027-03-10'), HOY_SEMAFORO)).toBe('Vence el 10/03/2027');
  });
});

describe('productosVencidos', () => {
  it('solo lo que venció antes de hoy, tenga o no la alerta prendida', () => {
    const hoy = new Date(2026, 9, 22, 18, 0);
    const lista = [
      { id: 'a', fecha_vencimiento: '2026-10-21', alerta_vencimiento_habilitada: false },
      { id: 'b', fecha_vencimiento: '2026-10-22', alerta_vencimiento_habilitada: true },
      { id: 'c', fecha_vencimiento: null, alerta_vencimiento_habilitada: true },
      { id: 'd', fecha_vencimiento: '2025-01-01', alerta_vencimiento_habilitada: true },
    ] as unknown as Producto[];
    expect(productosVencidos(lista, hoy).map((p) => p.id)).toEqual(['a', 'd']);
  });
});
