/**
 * Tests de src/services/usuarios.ts (ABM de usuarios para admins). Supabase
 * se mockea entero: solo se prueba que cada función llame a la RPC correcta
 * con los argumentos correctos, mapee la respuesta y propague los errores
 * (la validación real de "solo admins" vive en las RPCs de Postgres).
 */
const mockRpc = jest.fn();
const mockGetUser = jest.fn();
const mockUpdateEq = jest.fn();
const mockUpdate = jest.fn((_datos: unknown) => ({ eq: (...args: unknown[]) => mockUpdateEq(...args) }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { getUser: () => mockGetUser() },
    from: () => ({ update: (datos: unknown) => mockUpdate(datos) }),
  },
}));

import {
  actualizarMiNombre,
  cambiarHabilitado,
  cambiarRol,
  filtrarUsuarios,
  inicialDe,
  listarUsuarios,
  validarNombre,
} from './usuarios';
import type { UsuarioAdmin } from './usuarios';

beforeEach(() => {
  mockRpc.mockReset();
});

describe('listarUsuarios', () => {
  it('llama a admin_listar_usuarios y pasa las columnas a camelCase', async () => {
    mockRpc.mockResolvedValue({
      data: [
        {
          id: 'u1',
          email: 'ana@mail.com',
          nombre: 'Ana',
          rol: 'usuario',
          habilitado: false,
          created_at: '2026-09-01T00:00:00Z',
          cantidad_hogares: 2,
          avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatares/u1/1.jpg',
        },
      ],
      error: null,
    });

    const resultado = await listarUsuarios();

    expect(mockRpc).toHaveBeenCalledWith('admin_listar_usuarios');
    expect(resultado).toEqual([
      {
        id: 'u1',
        email: 'ana@mail.com',
        nombre: 'Ana',
        rol: 'usuario',
        habilitado: false,
        createdAt: '2026-09-01T00:00:00Z',
        cantidadHogares: 2,
        avatarUrl: 'https://x.supabase.co/storage/v1/object/public/avatares/u1/1.jpg',
      },
    ]);
  });

  it('devuelve [] si la RPC no trae datos', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await expect(listarUsuarios()).resolves.toEqual([]);
  });

  it('propaga el error si quien llama no es admin', async () => {
    const error = new Error('Solo un administrador puede ver la lista de usuarios');
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(listarUsuarios()).rejects.toBe(error);
  });
});

describe('cambiarHabilitado', () => {
  it('llama a admin_set_usuario_habilitado con el id y el valor', async () => {
    const fila = { id: 'u1', habilitado: false };
    mockRpc.mockResolvedValue({ data: fila, error: null });

    await expect(cambiarHabilitado('u1', false)).resolves.toBe(fila);
    expect(mockRpc).toHaveBeenCalledWith('admin_set_usuario_habilitado', { p_usuario_id: 'u1', p_habilitado: false });
  });

  it('propaga el error (por ejemplo, deshabilitarse a uno mismo)', async () => {
    const error = new Error('No podés deshabilitar tu propia cuenta');
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(cambiarHabilitado('yo', false)).rejects.toBe(error);
  });
});

describe('cambiarRol', () => {
  it('llama a admin_set_rol_usuario con el id y el rol', async () => {
    const fila = { id: 'u1', rol: 'administrador' };
    mockRpc.mockResolvedValue({ data: fila, error: null });

    await expect(cambiarRol('u1', 'administrador')).resolves.toBe(fila);
    expect(mockRpc).toHaveBeenCalledWith('admin_set_rol_usuario', { p_usuario_id: 'u1', p_rol: 'administrador' });
  });

  it('propaga el error (por ejemplo, quitarse el rol a uno mismo)', async () => {
    const error = new Error('No podés quitarte el rol de administrador a vos mismo');
    mockRpc.mockResolvedValue({ data: null, error });
    await expect(cambiarRol('yo', 'usuario')).rejects.toBe(error);
  });
});

describe('filtrarUsuarios', () => {
  const base = { createdAt: '2026-09-01', cantidadHogares: 1, avatarUrl: null };
  const usuarios: UsuarioAdmin[] = [
    { ...base, id: '1', email: 'ana@mail.com', nombre: 'Ana López', rol: 'administrador', habilitado: true },
    { ...base, id: '2', email: 'jose@mail.com', nombre: 'José Pérez', rol: 'usuario', habilitado: false },
    { ...base, id: '3', email: 'sinnombre@mail.com', nombre: null, rol: 'usuario', habilitado: true },
  ];
  const ids = (lista: UsuarioAdmin[]) => lista.map((u) => u.id);

  it('sin búsqueda ni filtro devuelve todos', () => {
    expect(ids(filtrarUsuarios(usuarios, '', 'todos'))).toEqual(['1', '2', '3']);
  });

  it('busca por nombre sin distinguir mayúsculas ni tildes', () => {
    expect(ids(filtrarUsuarios(usuarios, 'JOSE', 'todos'))).toEqual(['2']);
    expect(ids(filtrarUsuarios(usuarios, 'pérez', 'todos'))).toEqual(['2']);
  });

  it('busca por email, incluso en usuarios sin nombre', () => {
    expect(ids(filtrarUsuarios(usuarios, 'sinnombre', 'todos'))).toEqual(['3']);
  });

  it('filtra administradores y deshabilitados', () => {
    expect(ids(filtrarUsuarios(usuarios, '', 'administradores'))).toEqual(['1']);
    expect(ids(filtrarUsuarios(usuarios, '', 'deshabilitados'))).toEqual(['2']);
  });

  it('combina búsqueda y filtro', () => {
    expect(ids(filtrarUsuarios(usuarios, 'ana', 'deshabilitados'))).toEqual([]);
  });
});

describe('cuenta propia', () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'yo' } } });
    mockUpdateEq.mockResolvedValue({ error: null });
    mockUpdate.mockClear();
    mockUpdateEq.mockClear();
  });

  it('validarNombre limpia espacios y rechaza vacío o muy largo', () => {
    expect(validarNombre('  Ana   María ')).toBe('Ana María');
    expect(() => validarNombre('   ')).toThrow('vacío');
    expect(() => validarNombre('x'.repeat(61))).toThrow('60');
  });

  it('actualizarMiNombre cambia solo la fila del usuario logueado', async () => {
    await actualizarMiNombre(' Ana ');
    expect(mockUpdate).toHaveBeenCalledWith({ nombre: 'Ana' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'yo');
  });

  it('actualizarMiNombre no consulta Supabase si el nombre no es válido', async () => {
    await expect(actualizarMiNombre('')).rejects.toThrow('vacío');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('actualizarMiNombre propaga el error de Supabase', async () => {
    mockUpdateEq.mockResolvedValue({ error: new Error('sin red') });
    await expect(actualizarMiNombre('Ana')).rejects.toThrow('sin red');
  });

  it('inicialDe usa el nombre, o el email si no hay nombre', () => {
    expect(inicialDe('ana', 'x@mail.com')).toBe('A');
    expect(inicialDe(null, 'beto@mail.com')).toBe('B');
    expect(inicialDe('  ', '')).toBe('?');
  });
});
