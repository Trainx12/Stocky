/**
 * Tests de src/services/avatar.ts (foto de perfil). Supabase se mockea: acá se
 * prueba la lógica propia (qué ruta se arma, qué se vincula y qué se borra),
 * sobre todo que nunca se intente borrar una foto que no es del usuario.
 */
const mockUpload = jest.fn();
const mockRemove = jest.fn();
const mockList = jest.fn();
const mockUpdateEq = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mockUpload(...a),
        remove: (...a: unknown[]) => mockRemove(...a),
        list: (...a: unknown[]) => mockList(...a),
        getPublicUrl: (ruta: string) => ({
          data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/avatares/${ruta}` },
        }),
      }),
    },
    from: jest.fn(() => ({
      update: (datos: unknown) => ({ eq: (...a: unknown[]) => mockUpdateEq(datos, ...a) }),
    })),
  },
}));

import { borrarMisFotosDePerfil, cambiarMiAvatar, quitarMiAvatar, rutaDeAvatar } from './avatar';

const VIEJA = 'https://x.supabase.co/storage/v1/object/public/avatares/u1/111.jpg';

beforeEach(() => {
  jest.clearAllMocks();
  mockUpload.mockResolvedValue({ error: null });
  mockRemove.mockResolvedValue({ error: null });
  mockUpdateEq.mockResolvedValue({ error: null });
  mockList.mockResolvedValue({ data: [], error: null });
});

describe('rutaDeAvatar', () => {
  it('saca la ruta dentro del bucket de una foto del propio usuario', () => {
    expect(rutaDeAvatar(VIEJA, 'u1')).toBe('u1/111.jpg');
  });

  it('ignora el ?query y decodifica la ruta', () => {
    expect(rutaDeAvatar('https://x.supabase.co/storage/v1/object/public/avatares/u1/foto%201.jpg?t=2', 'u1')).toBe(
      'u1/foto 1.jpg',
    );
  });

  it('devuelve null si la foto es de otro usuario', () => {
    expect(rutaDeAvatar(VIEJA, 'u2')).toBeNull();
  });

  it('devuelve null para URLs de otro bucket, externas o vacías', () => {
    expect(rutaDeAvatar('https://x.supabase.co/storage/v1/object/public/catalogo-sugerencias/u1/1.jpg', 'u1')).toBeNull();
    expect(rutaDeAvatar('https://otro.sitio/u1/1.jpg', 'u1')).toBeNull();
    expect(rutaDeAvatar(null, 'u1')).toBeNull();
    expect(rutaDeAvatar(undefined, 'u1')).toBeNull();
  });
});

describe('cambiarMiAvatar', () => {
  it('sube a la carpeta del usuario, la vincula y borra la foto vieja', async () => {
    const url = await cambiarMiAvatar({ id: 'u1', avatar_url: VIEJA }, 'QUJD');
    const ruta = mockUpload.mock.calls[0][0] as string;
    expect(ruta).toMatch(/^u1\/\d+\.jpg$/);
    expect(mockUpload.mock.calls[0][2]).toEqual({ contentType: 'image/jpeg' });
    expect(url).toContain(ruta);
    expect(mockUpdateEq).toHaveBeenCalledWith({ avatar_url: url }, 'id', 'u1');
    expect(mockRemove).toHaveBeenCalledWith(['u1/111.jpg']);
  });

  it('sin foto anterior no borra nada', async () => {
    await cambiarMiAvatar({ id: 'u1', avatar_url: null }, 'QUJD');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('si no se puede vincular, borra la recién subida y deja la vieja', async () => {
    mockUpdateEq.mockResolvedValue({ error: new Error('sin permiso') });
    await expect(cambiarMiAvatar({ id: 'u1', avatar_url: VIEJA }, 'QUJD')).rejects.toThrow('sin permiso');
    const ruta = mockUpload.mock.calls[0][0] as string;
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith([ruta]);
  });

  it('si falla la subida, avisa y no cambia nada', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'muy grande' } });
    await expect(cambiarMiAvatar({ id: 'u1', avatar_url: VIEJA }, 'QUJD')).rejects.toThrow('muy grande');
    expect(mockUpdateEq).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe('quitarMiAvatar', () => {
  it('deja al usuario sin foto y borra el archivo', async () => {
    await quitarMiAvatar({ id: 'u1', avatar_url: VIEJA });
    expect(mockUpdateEq).toHaveBeenCalledWith({ avatar_url: null }, 'id', 'u1');
    expect(mockRemove).toHaveBeenCalledWith(['u1/111.jpg']);
  });

  it('si la base no lo guarda, no borra el archivo', async () => {
    mockUpdateEq.mockResolvedValue({ error: new Error('sin red') });
    await expect(quitarMiAvatar({ id: 'u1', avatar_url: VIEJA })).rejects.toThrow('sin red');
    expect(mockRemove).not.toHaveBeenCalled();
  });
});

describe('borrarMisFotosDePerfil', () => {
  it('borra todos los archivos de la carpeta del usuario', async () => {
    mockList.mockResolvedValue({ data: [{ name: '111.jpg' }, { name: '222.jpg' }], error: null });
    await borrarMisFotosDePerfil('u1');
    expect(mockList).toHaveBeenCalledWith('u1');
    expect(mockRemove).toHaveBeenCalledWith(['u1/111.jpg', 'u1/222.jpg']);
  });

  it('si no tiene fotos no llama a remove', async () => {
    await borrarMisFotosDePerfil('u1');
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('si no se pueden borrar, avisa (para no borrar la cuenta dejando la foto pública)', async () => {
    mockList.mockResolvedValue({ data: [{ name: '111.jpg' }], error: null });
    mockRemove.mockResolvedValue({ error: { message: 'sin red' } });
    await expect(borrarMisFotosDePerfil('u1')).rejects.toThrow('No se pudo borrar tu foto de perfil');
  });
});
