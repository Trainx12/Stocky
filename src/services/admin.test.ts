/**
 * Tests de src/services/admin.ts (panel de administración) y
 * src/services/comentarios.ts: métricas, catálogo administrado, cuenta
 * protegida, registro y comentarios. Supabase se mockea: acá se prueba la
 * lógica propia (validaciones, textos, qué se le pide a la base).
 */
const mockRpc = jest.fn();
const mockInsert = jest.fn();
const mockUpdateEq = jest.fn();
const mockLimit = jest.fn();
const mockSingle = jest.fn();
const mockUpload = jest.fn();
const mockRemove = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mockUpload(...a),
        remove: (...a: unknown[]) => mockRemove(...a),
        getPublicUrl: (ruta: string) => ({
          data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/${ruta}` },
        }),
      }),
    },
    from: jest.fn(() => ({
      // insert() se usa solo (comentarios) o encadenado con select().single()
      // (agregar al catálogo devuelve el producto creado).
      insert: (...a: unknown[]) => {
        const resultado = mockInsert(...a);
        return Object.assign(Promise.resolve(resultado), { select: () => ({ single: () => mockSingle(...a) }) });
      },
      update: (datos: unknown) => ({ eq: (...a: unknown[]) => mockUpdateEq(datos, ...a) }),
      select: () => ({ order: () => ({ limit: (...a: unknown[]) => mockLimit(...a) }) }),
    })),
  },
}));

import {
  agregarAlCatalogo,
  cambiarFotoCatalogo,
  editarCatalogo,
  quitarFotoCatalogo,
  esCuentaProtegida,
  iconoDeAccion,
  listarRegistro,
  obtenerMetricas,
  sacarDelCatalogo,
  tarjetasDeMetricas,
  validarProductoCatalogo,
} from './admin';
import { enviarComentario, listarComentarios, validarComentario } from './comentarios';
import type { MetricasAdmin } from '../types/database';

const METRICAS: MetricasAdmin = {
  usuarios_total: 7,
  usuarios_deshabilitados: 1,
  usuarios_nuevos_30d: 2,
  usuarios_activos_30d: 5,
  administradores: 3,
  hogares_total: 13,
  hogares_activos_30d: 4,
  productos_en_despensas: 81,
  productos_cargados_30d: 65,
  catalogo_aprobados: 257,
  sugerencias_pendientes: 1,
  comentarios_30d: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockInsert.mockReturnValue({ error: null });
  mockSingle.mockResolvedValue({ data: { id: 'nuevo', imagen_url: null }, error: null });
  mockUpload.mockResolvedValue({ error: null });
  mockRemove.mockResolvedValue({ error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockRpc.mockResolvedValue({ data: null, error: null });
});

describe('cuenta protegida', () => {
  it('reconoce la cuenta principal sin importar mayúsculas ni espacios', () => {
    expect(esCuentaProtegida('ruttyfacundo@gmail.com')).toBe(true);
    expect(esCuentaProtegida(' RuttyFacundo@Gmail.com ')).toBe(true);
    expect(esCuentaProtegida('otra@gmail.com')).toBe(false);
    expect(esCuentaProtegida(null)).toBe(false);
  });
});

describe('métricas', () => {
  it('convierte lo que devuelve la base a números (y faltantes a 0)', async () => {
    mockRpc.mockResolvedValue({ data: { usuarios_total: '7', hogares_total: 13 }, error: null });
    const m = await obtenerMetricas();
    expect(mockRpc).toHaveBeenCalledWith('admin_metricas');
    expect(m.usuarios_total).toBe(7);
    expect(m.hogares_total).toBe(13);
    expect(m.comentarios_30d).toBe(0);
  });

  it('si no sos admin, la base lo rechaza y el error sube', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('Solo los administradores pueden ver las métricas') });
    await expect(obtenerMetricas()).rejects.toThrow('Solo los administradores');
  });

  it('arma las tarjetas con contexto y singular/plural', () => {
    const tarjetas = tarjetasDeMetricas(METRICAS);
    expect(tarjetas.map((t) => t.clave)).toEqual(['usuarios', 'hogares', 'productos', 'catalogo', 'admins', 'comentarios']);
    expect(tarjetas[0]).toMatchObject({ valor: 7, detalle: '5 activos y 2 nuevos en 30 días' });
    expect(tarjetas[3].detalle).toBe('1 sugerencia pendiente');
    expect(tarjetas[4].detalle).toBe('1 cuenta deshabilitada');
    expect(tarjetasDeMetricas({ ...METRICAS, sugerencias_pendientes: 3 })[3].detalle).toBe('3 sugerencias pendientes');
  });
});

describe('catálogo administrado', () => {
  it('valida y limpia lo que se carga', () => {
    expect(validarProductoCatalogo({ nombre: '  dulce   de leche ', categoria: ' Lácteos ', unidad: 'g' })).toEqual({
      datos: { nombre: 'Dulce de leche', categoria: 'Lácteos', unidad: 'g' },
    });
    expect(validarProductoCatalogo({ nombre: ' ', categoria: 'Otros', unidad: 'g' })).toEqual({ error: 'Escribí el nombre del producto.' });
    expect(validarProductoCatalogo({ nombre: 'Pan', categoria: '', unidad: 'g' })).toEqual({ error: 'Elegí o escribí una categoría.' });
    expect('error' in validarProductoCatalogo({ nombre: 'x'.repeat(61), categoria: 'Otros', unidad: 'g' })).toBe(true);
  });

  it('un admin agrega productos ya aprobados y recibe el producto creado', async () => {
    const creado = await agregarAlCatalogo({ nombre: 'yerba', categoria: 'Infusiones', unidad: 'kg' });
    expect(mockInsert).toHaveBeenCalledWith({ nombre: 'Yerba', categoria: 'Infusiones', unidad: 'kg', estado: 'aprobado' });
    expect(creado.id).toBe('nuevo');
  });

  it('un nombre repetido da un mensaje entendible', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    await expect(agregarAlCatalogo({ nombre: 'Leche', categoria: 'Lácteos', unidad: 'l' })).rejects.toThrow(
      'Ya hay un producto con ese nombre',
    );
  });

  it('no manda nada si los datos no son válidos', async () => {
    await expect(editarCatalogo('c1', { nombre: '', categoria: 'Otros', unidad: 'g' })).rejects.toThrow();
    expect(mockUpdateEq).not.toHaveBeenCalled();
  });

  it('corregir actualiza solo nombre, categoría y unidad', async () => {
    await editarCatalogo('c1', { nombre: 'Pimentón', categoria: 'Otros', unidad: 'g' });
    expect(mockUpdateEq).toHaveBeenCalledWith({ nombre: 'Pimentón', categoria: 'Otros', unidad: 'g' }, 'id', 'c1');
  });

  it('sacar del catálogo usa la función que conserva las despensas', async () => {
    await sacarDelCatalogo('c1');
    expect(mockRpc).toHaveBeenCalledWith('admin_sacar_del_catalogo', { p_catalogo_id: 'c1' });
  });
});

describe('fotos del catálogo', () => {
  const VIEJA = 'https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/u1/123.jpg';

  it('cambiar: sube a catalogo/, la vincula y borra la foto vieja (si era nuestra)', async () => {
    const url = await cambiarFotoCatalogo({ id: 'c1', imagen_url: VIEJA }, 'QUJD');
    const ruta = mockUpload.mock.calls[0][0] as string;
    expect(ruta).toMatch(/^catalogo\/c1-\d+\.jpg$/);
    expect(mockUpload.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg' });
    expect(url).toContain(ruta);
    expect(mockUpdateEq).toHaveBeenCalledWith({ imagen_url: url }, 'id', 'c1');
    expect(mockRemove).toHaveBeenCalledWith(['u1/123.jpg']);
  });

  it('cambiar: si no se puede vincular, borra la foto recién subida y no toca la vieja', async () => {
    mockUpdateEq.mockResolvedValue({ error: new Error('sin permiso') });
    await expect(cambiarFotoCatalogo({ id: 'c1', imagen_url: VIEJA }, 'QUJD')).rejects.toThrow('sin permiso');
    const ruta = mockUpload.mock.calls[0][0] as string;
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith([ruta]);
  });

  it('cambiar: si falla la subida, avisa y no cambia nada', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'muy grande' } });
    await expect(cambiarFotoCatalogo({ id: 'c1', imagen_url: null }, 'QUJD')).rejects.toThrow('muy grande');
    expect(mockUpdateEq).not.toHaveBeenCalled();
  });

  it('quitar: deja el producto sin foto subida y borra el archivo', async () => {
    await quitarFotoCatalogo({ id: 'c1', imagen_url: VIEJA });
    expect(mockUpdateEq).toHaveBeenCalledWith({ imagen_url: null }, 'id', 'c1');
    expect(mockRemove).toHaveBeenCalledWith(['u1/123.jpg']);
  });

  it('no intenta borrar fotos que no son de Stocky', async () => {
    await quitarFotoCatalogo({ id: 'c1', imagen_url: 'https://otro.sitio/foto.jpg' });
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe('registro de acciones', () => {
  it('trae las últimas acciones', async () => {
    mockLimit.mockResolvedValue({ data: [{ id: 'a1', accion: 'catalogo_sacar', detalle: 'Sacó "X"' }], error: null });
    await expect(listarRegistro(50)).resolves.toHaveLength(1);
    expect(mockLimit).toHaveBeenCalledWith(50);
  });

  it('un ícono por tipo de acción', () => {
    expect(iconoDeAccion('sugerencia_aprobar')).toBe('checkmark-circle-outline');
    expect(iconoDeAccion('catalogo_sacar')).toBe('trash-outline');
    expect(iconoDeAccion('usuario_rol')).toBe('shield-outline');
    expect(iconoDeAccion('otra_cosa')).toBe('ellipse-outline');
  });
});

describe('comentarios', () => {
  it('valida largo mínimo y máximo', () => {
    expect(validarComentario('  ok ')).toMatch(/un poco más/);
    expect(validarComentario('Me encanta la app')).toBeNull();
    expect(validarComentario('x'.repeat(2001))).toMatch(/2000/);
  });

  it('envía a nombre del usuario, con plataforma y versión', async () => {
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

  it('los admins los listan con la función de la base', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });
    await listarComentarios(20);
    expect(mockRpc).toHaveBeenCalledWith('admin_listar_comentarios', { p_limite: 20 });
  });
});
