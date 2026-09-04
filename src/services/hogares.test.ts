/**
 * Tests de src/services/hogares.ts. Las tres operaciones que modifican
 * membresía son RPCs de Postgres, así que acá solo se verifica que cada
 * wrapper llame a la función correcta con los argumentos correctos y
 * propague errores (la lógica real vive en
 * supabase/migrations/20260826130000_hogares_multi_membresia.sql).
 *
 * El grupo `listarMisHogares` es el más importante: cubre justo el bug
 * encontrado en QA del PR #1 (ver docs/incidentes-sprint2.md #2), donde
 * la falta de un filtro explícito por usuario hacía que una cuenta admin
 * viera hogares ajenos. Este test evita que alguien vuelva a sacar ese
 * `.eq('usuario_id', ...)` sin darse cuenta.
 */
// Prefijo "mock" a propósito: jest.mock() se "hoistea" arriba de todo el
// archivo, así que solo puede referenciar variables que empiecen con ese
// prefijo (si no, Jest tira ReferenceError al no poder garantizar el
// orden de inicialización).
const mockOrder = jest.fn();
// listarMisHogares y editarHogar comparten from(...).select(...), pero cada
// una sigue una cadena de métodos distinta (.eq().order() vs .eq().select().single()),
// por eso select() puede devolver cualquiera de las dos ramas según el mock del momento.
const mockSingle = jest.fn();
const mockUpdateEq = jest.fn(() => ({ select: jest.fn(() => ({ single: mockSingle })) }));
const mockUpdate = jest.fn(() => ({ eq: mockUpdateEq }));
const mockEq = jest.fn(() => ({ order: mockOrder }));
const mockSelect = jest.fn(() => ({ eq: mockEq }));

jest.mock('../lib/supabase', () => ({
  supabase: {
    rpc: jest.fn(),
    auth: { getUser: jest.fn() },
    from: jest.fn(() => ({ select: mockSelect, update: mockUpdate })),
  },
}));

import { supabase } from '../lib/supabase';
import {
  crearHogar,
  editarHogar,
  expulsarMiembro,
  listarMiembrosDeHogar,
  listarMisHogares,
  listarMisSolicitudesPendientes,
  listarSolicitudesPendientes,
  permitirEditarHogar,
  responderSolicitud,
  salirDeHogar,
  unirseAHogar,
} from './hogares';

const rpc = supabase.rpc as jest.Mock;
const getUser = supabase.auth.getUser as jest.Mock;
const from = supabase.from as jest.Mock;

beforeEach(() => {
  rpc.mockReset();
  getUser.mockReset();
  from.mockClear();
  mockSelect.mockClear();
  mockEq.mockClear();
  mockOrder.mockReset();
  mockUpdate.mockClear();
  mockUpdateEq.mockClear();
  mockSingle.mockReset();
});

describe('crearHogar', () => {
  it('llama a la RPC crear_hogar con el nombre y devuelve el hogar creado', async () => {
    const hogar = { id: '1', nombre: 'Casa', codigo_invitacion: 'ABC123', created_at: '2026-01-01' };
    rpc.mockResolvedValue({ data: hogar, error: null });

    const resultado = await crearHogar('Casa');

    expect(rpc).toHaveBeenCalledWith('crear_hogar', { p_nombre: 'Casa' });
    expect(resultado).toEqual(hogar);
  });

  it('propaga el error si la RPC falla (ej: nombre vacío)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('El nombre del hogar no puede estar vacío') });

    await expect(crearHogar('')).rejects.toThrow('El nombre del hogar no puede estar vacío');
  });
});

describe('unirseAHogar', () => {
  it('llama a la RPC unirse_a_hogar con el código', async () => {
    const hogar = { id: '2', nombre: 'Otra casa', codigo_invitacion: 'XYZ789', created_at: '2026-01-01' };
    rpc.mockResolvedValue({ data: hogar, error: null });

    const resultado = await unirseAHogar('xyz789');

    expect(rpc).toHaveBeenCalledWith('unirse_a_hogar', { p_codigo: 'xyz789' });
    expect(resultado).toEqual(hogar);
  });

  it('propaga el error si el código no existe', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('No existe ningún hogar con ese código de invitación') });

    await expect(unirseAHogar('NOEXISTE')).rejects.toThrow('No existe ningún hogar con ese código de invitación');
  });
});

describe('salirDeHogar', () => {
  it('llama a la RPC salir_de_hogar con el id del hogar', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await salirDeHogar('hogar-1');

    expect(rpc).toHaveBeenCalledWith('salir_de_hogar', { p_hogar_id: 'hogar-1' });
  });

  it('propaga el error si la RPC falla', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('fallo inesperado') });

    await expect(salirDeHogar('hogar-1')).rejects.toThrow('fallo inesperado');
  });
});

describe('editarHogar', () => {
  it('actualiza el nombre (recortando espacios) y devuelve el hogar actualizado', async () => {
    const hogar = { id: 'hogar-1', nombre: 'Casa Nueva', codigo_invitacion: 'ABC123', created_at: '2026-01-01' };
    mockSingle.mockResolvedValue({ data: hogar, error: null });

    const resultado = await editarHogar('hogar-1', '  Casa Nueva  ');

    expect(from).toHaveBeenCalledWith('hogares');
    expect(mockUpdate).toHaveBeenCalledWith({ nombre: 'Casa Nueva' });
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'hogar-1');
    expect(resultado).toEqual(hogar);
  });

  it('rechaza un nombre vacío (o solo espacios) sin llamar a Supabase', async () => {
    await expect(editarHogar('hogar-1', '   ')).rejects.toThrow('El nombre del hogar no puede estar vacío');
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga el error si la RLS rechaza el update (no es miembro del hogar)', async () => {
    mockSingle.mockResolvedValue({ data: null, error: new Error('new row violates row-level security policy') });

    await expect(editarHogar('hogar-ajeno', 'Otro nombre')).rejects.toThrow('new row violates row-level security policy');
  });
});

describe('listarMisHogares', () => {
  it('filtra explícitamente por el usuario logueado (regresión: no debe apoyarse solo en RLS)', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockOrder.mockResolvedValue({ data: [], error: null });

    await listarMisHogares();

    expect(from).toHaveBeenCalledWith('hogar_miembros');
    expect(mockEq).toHaveBeenCalledWith('usuario_id', 'user-123');
  });

  it('aplana el resultado anidado { rol, puede_editar, estado, hogares: {...} } a HogarConRol[]', async () => {
    const hogarA = { id: '1', nombre: 'Casa A', codigo_invitacion: 'AAA111', created_at: '2026-01-01' };
    const hogarB = { id: '2', nombre: 'Casa B', codigo_invitacion: 'BBB222', created_at: '2026-01-02' };
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockOrder.mockResolvedValue({
      data: [
        { rol: 'dueno', puede_editar: false, estado: 'aprobado', hogares: hogarA },
        { rol: 'invitado', puede_editar: false, estado: 'aprobado', hogares: hogarB },
      ],
      error: null,
    });

    const resultado = await listarMisHogares();

    expect(resultado).toEqual([
      { ...hogarA, miRol: 'dueno', puedoEditar: true },
      { ...hogarB, miRol: 'invitado', puedoEditar: false },
    ]);
  });

  it('un invitado con puede_editar=true también puede editar (puedoEditar: true)', async () => {
    const hogarA = { id: '1', nombre: 'Casa A', codigo_invitacion: 'AAA111', created_at: '2026-01-01' };
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockOrder.mockResolvedValue({
      data: [{ rol: 'invitado', puede_editar: true, estado: 'aprobado', hogares: hogarA }],
      error: null,
    });

    const resultado = await listarMisHogares();

    expect(resultado).toEqual([{ ...hogarA, miRol: 'invitado', puedoEditar: true }]);
  });

  it('descarta filas con hogares en null en vez de romper', async () => {
    const hogarA = { id: '1', nombre: 'Casa A', codigo_invitacion: 'AAA111', created_at: '2026-01-01' };
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockOrder.mockResolvedValue({
      data: [
        { rol: 'dueno', puede_editar: false, estado: 'aprobado', hogares: hogarA },
        { rol: 'invitado', puede_editar: false, estado: 'aprobado', hogares: null },
      ],
      error: null,
    });

    const resultado = await listarMisHogares();

    expect(resultado).toEqual([{ ...hogarA, miRol: 'dueno', puedoEditar: true }]);
  });

  it('descarta hogares con una solicitud pendiente (todavía no es miembro de verdad)', async () => {
    const hogarA = { id: '1', nombre: 'Casa A', codigo_invitacion: 'AAA111', created_at: '2026-01-01' };
    const hogarPendiente = { id: '2', nombre: 'Casa B', codigo_invitacion: 'BBB222', created_at: '2026-01-02' };
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockOrder.mockResolvedValue({
      data: [
        { rol: 'dueno', puede_editar: false, estado: 'aprobado', hogares: hogarA },
        { rol: 'invitado', puede_editar: false, estado: 'pendiente', hogares: hogarPendiente },
      ],
      error: null,
    });

    const resultado = await listarMisHogares();

    expect(resultado).toEqual([{ ...hogarA, miRol: 'dueno', puedoEditar: true }]);
  });

  it('devuelve un array vacío si no hay usuario logueado, sin consultar la tabla', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const resultado = await listarMisHogares();

    expect(resultado).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it('propaga el error si falla la consulta', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
    mockOrder.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarMisHogares()).rejects.toThrow('fallo de red');
  });
});

describe('listarMiembrosDeHogar', () => {
  it('filtra por hogar_id y aplana { usuario_id, rol, puede_editar, usuarios: {...} }, solo estado aprobado', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          usuario_id: 'u-1',
          rol: 'dueno',
          puede_editar: false,
          estado: 'aprobado',
          usuarios: { nombre: 'Julieta', email: 'julieta@test.com' },
        },
        {
          usuario_id: 'u-2',
          rol: 'invitado',
          puede_editar: true,
          estado: 'aprobado',
          usuarios: { nombre: null, email: 'nuevo@test.com' },
        },
        {
          usuario_id: 'u-3',
          rol: 'invitado',
          puede_editar: false,
          estado: 'pendiente',
          usuarios: { nombre: null, email: 'esperando@test.com' },
        },
      ],
      error: null,
    });

    const resultado = await listarMiembrosDeHogar('hogar-1');

    expect(from).toHaveBeenCalledWith('hogar_miembros');
    expect(mockEq).toHaveBeenCalledWith('hogar_id', 'hogar-1');
    expect(resultado).toEqual([
      { usuarioId: 'u-1', rol: 'dueno', puedeEditar: false, nombre: 'Julieta', email: 'julieta@test.com' },
      { usuarioId: 'u-2', rol: 'invitado', puedeEditar: true, nombre: null, email: 'nuevo@test.com' },
    ]);
  });

  it('descarta filas con usuarios en null en vez de romper', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          usuario_id: 'u-1',
          rol: 'dueno',
          puede_editar: false,
          estado: 'aprobado',
          usuarios: { nombre: 'Julieta', email: 'julieta@test.com' },
        },
        { usuario_id: 'u-2', rol: 'invitado', puede_editar: false, estado: 'aprobado', usuarios: null },
      ],
      error: null,
    });

    const resultado = await listarMiembrosDeHogar('hogar-1');

    expect(resultado).toEqual([{ usuarioId: 'u-1', rol: 'dueno', puedeEditar: false, nombre: 'Julieta', email: 'julieta@test.com' }]);
  });

  it('propaga el error si falla la consulta', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarMiembrosDeHogar('hogar-1')).rejects.toThrow('fallo de red');
  });
});

describe('listarSolicitudesPendientes', () => {
  it('filtra por hogar_id y devuelve solo las filas en estado pendiente', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          usuario_id: 'u-1',
          rol: 'dueno',
          puede_editar: false,
          estado: 'aprobado',
          usuarios: { nombre: 'Julieta', email: 'julieta@test.com' },
        },
        {
          usuario_id: 'u-2',
          rol: 'invitado',
          puede_editar: false,
          estado: 'pendiente',
          usuarios: { nombre: null, email: 'nuevo@test.com' },
        },
      ],
      error: null,
    });

    const resultado = await listarSolicitudesPendientes('hogar-1');

    expect(from).toHaveBeenCalledWith('hogar_miembros');
    expect(mockEq).toHaveBeenCalledWith('hogar_id', 'hogar-1');
    expect(resultado).toEqual([{ usuarioId: 'u-2', nombre: null, email: 'nuevo@test.com' }]);
  });

  it('devuelve un array vacío si no hay solicitudes pendientes', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          usuario_id: 'u-1',
          rol: 'dueno',
          puede_editar: false,
          estado: 'aprobado',
          usuarios: { nombre: 'Julieta', email: 'julieta@test.com' },
        },
      ],
      error: null,
    });

    const resultado = await listarSolicitudesPendientes('hogar-1');

    expect(resultado).toEqual([]);
  });

  it('propaga el error si falla la consulta', async () => {
    mockOrder.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarSolicitudesPendientes('hogar-1')).rejects.toThrow('fallo de red');
  });
});

describe('responderSolicitud', () => {
  it('llama a la RPC responder_solicitud con hogar, usuario y si se aprueba o no', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await responderSolicitud('hogar-1', 'u-2', true);

    expect(rpc).toHaveBeenCalledWith('responder_solicitud', {
      p_hogar_id: 'hogar-1',
      p_usuario_id: 'u-2',
      p_aprobar: true,
    });
  });

  it('propaga el error si la RPC rechaza (ej: quien llama no es el dueño)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Solo el dueño del hogar puede aceptar o rechazar solicitudes') });

    await expect(responderSolicitud('hogar-1', 'u-2', false)).rejects.toThrow(
      'Solo el dueño del hogar puede aceptar o rechazar solicitudes',
    );
  });
});

describe('listarMisSolicitudesPendientes', () => {
  it('llama a la RPC y mapea { hogar_id, nombre } a MiSolicitudPendiente[]', async () => {
    rpc.mockResolvedValue({
      data: [
        { hogar_id: 'hogar-1', nombre: 'Casa A', created_at: '2026-01-01' },
        { hogar_id: 'hogar-2', nombre: 'Casa B', created_at: '2026-01-02' },
      ],
      error: null,
    });

    const resultado = await listarMisSolicitudesPendientes();

    expect(rpc).toHaveBeenCalledWith('listar_mis_solicitudes_pendientes');
    expect(resultado).toEqual([
      { hogarId: 'hogar-1', nombreHogar: 'Casa A' },
      { hogarId: 'hogar-2', nombreHogar: 'Casa B' },
    ]);
  });

  it('propaga el error si la RPC falla', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('fallo de red') });

    await expect(listarMisSolicitudesPendientes()).rejects.toThrow('fallo de red');
  });
});

describe('permitirEditarHogar', () => {
  it('llama a la RPC permitir_editar_hogar con hogar, usuario y el valor a setear', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await permitirEditarHogar('hogar-1', 'u-2', true);

    expect(rpc).toHaveBeenCalledWith('permitir_editar_hogar', {
      p_hogar_id: 'hogar-1',
      p_usuario_id: 'u-2',
      p_permitir: true,
    });
  });

  it('propaga el error si la RPC rechaza (ej: quien llama no es el dueño)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Solo el dueño del hogar puede cambiar permisos de edición') });

    await expect(permitirEditarHogar('hogar-1', 'u-2', true)).rejects.toThrow(
      'Solo el dueño del hogar puede cambiar permisos de edición',
    );
  });
});

describe('expulsarMiembro', () => {
  it('llama a la RPC expulsar_miembro con el hogar y el usuario a expulsar', async () => {
    rpc.mockResolvedValue({ data: null, error: null });

    await expulsarMiembro('hogar-1', 'u-2');

    expect(rpc).toHaveBeenCalledWith('expulsar_miembro', { p_hogar_id: 'hogar-1', p_usuario_id: 'u-2' });
  });

  it('propaga el error si la RPC rechaza (ej: quien llama no es el dueño, o el target es el dueño)', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Solo el dueño del hogar puede expulsar miembros') });

    await expect(expulsarMiembro('hogar-1', 'u-2')).rejects.toThrow('Solo el dueño del hogar puede expulsar miembros');
  });
});
