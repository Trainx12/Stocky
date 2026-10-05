/**
 * Tests de src/services/voz.ts: cómo se convierte lo que entendió Gemini en
 * acciones revisables (qué producto del hogar se toca, con qué cantidad y
 * fecha), y que aplicarlas use las mismas funciones que el ABM manual.
 */
jest.mock('./productos', () => ({
  ...jest.requireActual('./productos'),
  crearProducto: jest.fn(),
  editarProducto: jest.fn(),
  eliminarProducto: jest.fn(),
}));
jest.mock('../lib/supabase', () => ({ supabase: {} }));

import type { Producto, ProductoCatalogo } from '../types/database';
import { crearProducto, editarProducto, eliminarProducto } from './productos';
import {
  accionAplicable,
  aplicarAccionDeVoz,
  armarAccionesDeVoz,
  cantidadFinal,
  elegirProducto,
  fechaDeHoy,
  inventarioParaVoz,
} from './voz';
import type { AccionDeVozInterpretada } from './externalApis';

function item(nombre: string, extra: Partial<ProductoCatalogo> = {}): ProductoCatalogo {
  return {
    id: `cat-${nombre}`,
    nombre,
    categoria: 'Almacén',
    unidad: 'unidad',
    imagen_url: null,
    estado: 'aprobado',
    sugerido_por: null,
    created_at: '2026-01-01',
    ...extra,
  };
}

function producto(id: string, nombre: string, extra: Partial<Producto> = {}): Producto {
  return {
    id,
    hogar_id: 'h1',
    nombre,
    categoria: 'Lácteos',
    unidad: 'unidad',
    cantidad: 2,
    stock_minimo: 0,
    fecha_vencimiento: null,
    alerta_vencimiento_habilitada: true,
    catalogo_id: null,
    marca: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...extra,
  };
}

const catalogo = [item('Leche', { categoria: 'Lácteos', unidad: 'l' }), item('Huevo', { categoria: 'Frescos' }), item('Yogur')];

function armar(acciones: AccionDeVozInterpretada[], productos: Producto[] = []) {
  return armarAccionesDeVoz({ transcripcion: '', acciones }, productos, catalogo);
}

describe('cantidadFinal', () => {
  it('fija, suma y resta sobre la cantidad actual', () => {
    expect(cantidadFinal(2, 'fijar', 5)).toBe(5);
    expect(cantidadFinal(2, 'sumar', 0.5)).toBe(2.5);
    expect(cantidadFinal(2, 'restar', 1)).toBe(1);
  });

  it('nunca deja una cantidad negativa', () => {
    expect(cantidadFinal(1, 'restar', 3)).toBe(0);
  });

  it('sin operación deja la cantidad como estaba', () => {
    expect(cantidadFinal(4, null, null)).toBe(4);
    expect(cantidadFinal(4, 'restar', null)).toBe(4);
  });

  it('no arrastra errores de coma flotante', () => {
    expect(cantidadFinal(0.1, 'sumar', 0.2)).toBe(0.3);
  });
});

describe('armarAccionesDeVoz: alta', () => {
  it('toma la identidad del catálogo y la cantidad y fecha dichas', () => {
    const [accion] = armar([{ accion: 'alta', nombre: 'leche', marca: 'La Serenísima', cantidad: 2, fecha_vencimiento: '2026-11-15' }]);

    expect(accion).toMatchObject({
      tipo: 'alta',
      nombre: 'Leche',
      categoria: 'Lácteos',
      unidad: 'l',
      cantidad: '2',
      marca: 'La Serenísima',
      fecha: '2026-11-15',
      incluir: true,
    });
    expect(accion.catalogo?.id).toBe('cat-Leche');
  });

  it('sin cantidad dicha agrega 1', () => {
    expect(armar([{ accion: 'alta', nombre: 'Huevo' }])[0].cantidad).toBe('1');
  });

  it('fuera del catálogo queda en "Otros" con la unidad dicha', () => {
    const [accion] = armar([{ accion: 'alta', nombre: 'Tortuguita', cantidad: 1.5, unidad: 'kg' }]);
    expect(accion).toMatchObject({ nombre: 'Tortuguita', categoria: 'Otros', unidad: 'kg', catalogo: null, cantidad: '1.5' });
  });

  it('descarta una fecha que no existe y avisa', () => {
    const [accion] = armar([{ accion: 'alta', nombre: 'Leche', fecha_vencimiento: '2026-02-31' }]);
    expect(accion.fecha).toBe('');
    expect(accion.aviso).toMatch(/fecha/);
  });
});

describe('armarAccionesDeVoz: baja y modificación', () => {
  const leche = producto('p-leche', 'Leche', { cantidad: 3, unidad: 'l', fecha_vencimiento: '2026-10-20' });
  const yogur = producto('p-yogur', 'Yogur');

  it('usa el producto que eligió el modelo por id', () => {
    const [accion] = armar([{ accion: 'baja', nombre: 'Yogur', producto_id: 'p-yogur' }], [leche, yogur]);
    expect(accion.producto?.id).toBe('p-yogur');
    expect(accionAplicable(accion)).toBe(true);
  });

  it('si el id no existe, busca por nombre (tolerando plural)', () => {
    const [accion] = armar([{ accion: 'baja', nombre: 'yogures', producto_id: 'inventado' }], [leche, yogur]);
    expect(accion.producto?.id).toBe('p-yogur');
  });

  it('no encontrado: avisa y no se puede aplicar', () => {
    const [accion] = armar([{ accion: 'baja', nombre: 'Manteca' }], [leche, yogur]);
    expect(accion.producto).toBeNull();
    expect(accion.aviso).toMatch(/No encontramos "Manteca"/);
    expect(accionAplicable(accion)).toBe(false);
  });

  it('modificación: calcula la cantidad final y conserva la fecha si no se dijo otra', () => {
    const [accion] = armar(
      [{ accion: 'modificacion', nombre: 'Leche', producto_id: 'p-leche', cantidad: 1, operacion_cantidad: 'restar' }],
      [leche],
    );
    expect(accion).toMatchObject({ cantidad: '2', fecha: '2026-10-20', unidad: 'l' });
  });

  it('modificación de vencimiento: cambia la fecha y deja la cantidad', () => {
    const [accion] = armar(
      [{ accion: 'modificacion', nombre: 'Leche', producto_id: 'p-leche', fecha_vencimiento: '2026-12-01' }],
      [leche],
    );
    expect(accion).toMatchObject({ cantidad: '3', fecha: '2026-12-01' });
  });

  it('varios productos posibles: deja elegir y no aplica hasta elegir', () => {
    const otraLeche = producto('p-leche-2', 'Leche', { marca: 'Sancor', cantidad: 1 });
    const [accion] = armar(
      [{ accion: 'modificacion', nombre: 'Leche', cantidad: 1, operacion_cantidad: 'restar' }],
      [leche, otraLeche],
    );
    expect(accion.opciones.map((p) => p.id)).toEqual(['p-leche', 'p-leche-2']);
    expect(accionAplicable(accion)).toBe(false);

    const elegida = elegirProducto(accion, otraLeche);
    expect(elegida).toMatchObject({ cantidad: '0', marca: 'Sancor', incluir: true });
    expect(accionAplicable(elegida)).toBe(true);
  });

  it('si dijo la marca, desempata por marca', () => {
    const otraLeche = producto('p-leche-2', 'Leche', { marca: 'Sancor' });
    const [accion] = armar([{ accion: 'baja', nombre: 'Leche', marca: 'sancor' }], [leche, otraLeche]);
    expect(accion.producto?.id).toBe('p-leche-2');
  });
});

describe('armarAccionesDeVoz: respuestas raras', () => {
  it('ignora acciones desconocidas', () => {
    const acciones = armar([{ accion: 'comprar' as never, nombre: 'Leche' }]);
    expect(acciones).toEqual([]);
  });
});

describe('aplicarAccionDeVoz', () => {
  beforeEach(() => jest.clearAllMocks());

  it('alta crea el producto con los datos revisados', async () => {
    const [accion] = armar([{ accion: 'alta', nombre: 'Leche', cantidad: 2, fecha_vencimiento: '2026-11-15' }]);
    await aplicarAccionDeVoz('h1', accion);
    expect(crearProducto).toHaveBeenCalledWith('h1', expect.objectContaining({
      nombre: 'Leche',
      cantidad: 2,
      fechaVencimiento: '2026-11-15',
      catalogoId: 'cat-Leche',
    }));
  });

  it('baja elimina el producto', async () => {
    const [accion] = armar([{ accion: 'baja', nombre: 'Yogur', producto_id: 'p-yogur' }], [producto('p-yogur', 'Yogur')]);
    await aplicarAccionDeVoz('h1', accion);
    expect(eliminarProducto).toHaveBeenCalledWith('p-yogur');
  });

  it('modificación edita conservando stock mínimo y alerta', async () => {
    const leche = producto('p-leche', 'Leche', { stock_minimo: 1, alerta_vencimiento_habilitada: false });
    const [accion] = armar(
      [{ accion: 'modificacion', nombre: 'Leche', producto_id: 'p-leche', cantidad: 5, operacion_cantidad: 'fijar' }],
      [leche],
    );
    await aplicarAccionDeVoz('h1', accion);
    expect(editarProducto).toHaveBeenCalledWith('p-leche', expect.objectContaining({
      cantidad: 5,
      stockMinimo: 1,
      alertaVencimientoHabilitada: false,
    }));
  });
});

describe('utilidades', () => {
  it('fechaDeHoy usa la fecha local', () => {
    expect(fechaDeHoy(new Date(2026, 9, 5, 23, 30))).toBe('2026-10-05');
  });

  it('inventarioParaVoz manda solo lo necesario', () => {
    expect(inventarioParaVoz([producto('p1', 'Leche')])).toEqual([
      { id: 'p1', nombre: 'Leche', marca: null, cantidad: 2, unidad: 'unidad', fecha_vencimiento: null },
    ]);
  });
});
