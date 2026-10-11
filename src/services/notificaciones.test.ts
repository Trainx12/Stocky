/**
 * Tests de src/services/notificaciones.ts. Supabase se mockea con una
 * cadena "comodín": cada método (select/eq/in/order/limit/update/delete/not)
 * devuelve la misma cadena y la cadena es "awaitable" (resuelve con
 * `mockResultado`), así cada test arma solo la respuesta que le interesa y
 * verifica con qué filtros se llamó.
 */
const mockResultado = jest.fn();
const mockLlamadas: { metodo: string; args: unknown[] }[] = [];

function crearCadena(): Record<string, unknown> {
  const cadena: Record<string, unknown> = {};
  for (const metodo of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete', 'not']) {
    cadena[metodo] = (...args: unknown[]) => {
      mockLlamadas.push({ metodo, args });
      return cadena;
    };
  }
  cadena.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => mockResultado().then(resolve, reject);
  return cadena;
}

const mockFrom = jest.fn((_tabla: string) => crearCadena());
const mockGetUser = jest.fn();

jest.mock('../lib/supabase', () => ({
  supabase: {
    from: (tabla: string) => mockFrom(tabla),
    auth: { getUser: () => mockGetUser() },
  },
}));

import {
  aparienciaNotificacion,
  calcularAvisosLocales,
  contarNoLeidas,
  destinoNotificacion,
  eliminarNotificacion,
  guardarDiasAvisoGeneral,
  listarNotificaciones,
  listarProductosConFecha,
  marcarLeidas,
  marcarTodasLeidas,
  MAXIMO_AVISOS_LOCALES,
  textoGlobito,
  tiempoRelativo,
} from './notificaciones';
import type { TipoNotificacion } from '../types/database';

// Qué filtros recibió la consulta (ej. ['eq', 'usuario_id', 'u1']).
const filtros = () => mockLlamadas.map((l) => [l.metodo, ...l.args]);

beforeEach(() => {
  mockLlamadas.length = 0;
  mockFrom.mockClear();
  mockResultado.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('listarNotificaciones', () => {
  it('filtra explícito por el usuario logueado (no solo RLS), nuevas primero y con límite', async () => {
    const filas = [{ id: 'n1' }];
    mockResultado.mockResolvedValue({ data: filas, error: null });

    await expect(listarNotificaciones(10)).resolves.toBe(filas);

    expect(mockFrom).toHaveBeenCalledWith('notificaciones');
    expect(filtros()).toEqual([
      ['select', '*'],
      ['eq', 'usuario_id', 'u1'],
      ['order', 'created_at', { ascending: false }],
      ['limit', 10],
    ]);
  });

  it('falla claro si no hay sesión', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    await expect(listarNotificaciones()).rejects.toThrow('No hay una sesión activa');
  });

  it('propaga el error de Supabase', async () => {
    mockResultado.mockResolvedValue({ data: null, error: new Error('sin red') });
    await expect(listarNotificaciones()).rejects.toThrow('sin red');
  });
});

describe('contarNoLeidas', () => {
  it('cuenta solo las no leídas del usuario, sin traer filas', async () => {
    mockResultado.mockResolvedValue({ count: 4, error: null });

    await expect(contarNoLeidas()).resolves.toBe(4);

    expect(filtros()).toEqual([
      ['select', 'id', { count: 'exact', head: true }],
      ['eq', 'usuario_id', 'u1'],
      ['eq', 'leida', false],
    ]);
  });

  it('devuelve 0 si no viene conteo', async () => {
    mockResultado.mockResolvedValue({ count: null, error: null });
    await expect(contarNoLeidas()).resolves.toBe(0);
  });
});

describe('marcarLeidas / marcarTodasLeidas / eliminarNotificacion', () => {
  it('marcarLeidas no consulta nada con una lista vacía', async () => {
    await marcarLeidas([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('marcarLeidas actualiza solo esas, del usuario', async () => {
    mockResultado.mockResolvedValue({ error: null });
    await marcarLeidas(['a', 'b']);
    expect(filtros()).toEqual([
      ['update', { leida: true }],
      ['eq', 'usuario_id', 'u1'],
      ['in', 'id', ['a', 'b']],
    ]);
  });

  it('marcarTodasLeidas actualiza las no leídas del usuario', async () => {
    mockResultado.mockResolvedValue({ error: null });
    await marcarTodasLeidas();
    expect(filtros()).toEqual([
      ['update', { leida: true }],
      ['eq', 'usuario_id', 'u1'],
      ['eq', 'leida', false],
    ]);
  });

  it('eliminarNotificacion borra por usuario e id y propaga errores', async () => {
    mockResultado.mockResolvedValue({ error: null });
    await eliminarNotificacion('n9');
    expect(filtros()).toEqual([['delete'], ['eq', 'usuario_id', 'u1'], ['eq', 'id', 'n9']]);

    mockResultado.mockResolvedValue({ error: new Error('no') });
    await expect(eliminarNotificacion('n9')).rejects.toThrow('no');
  });
});

describe('guardarDiasAvisoGeneral', () => {
  it('guarda en la fila del usuario', async () => {
    mockResultado.mockResolvedValue({ error: null });
    await guardarDiasAvisoGeneral(10);
    expect(mockFrom).toHaveBeenCalledWith('usuarios');
    expect(filtros()).toEqual([['update', { dias_aviso_vencimiento: 10 }], ['eq', 'id', 'u1']]);
  });

  it.each([0, 61, 2.5, NaN])('rechaza %p sin consultar Supabase', async (dias) => {
    await expect(guardarDiasAvisoGeneral(dias)).rejects.toThrow('entre 1 y 60');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('listarProductosConFecha', () => {
  it('no consulta sin hogares', async () => {
    await expect(listarProductosConFecha([])).resolves.toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('filtra por los hogarIds explícitos y solo con fecha', async () => {
    mockResultado.mockResolvedValue({ data: [], error: null });
    await listarProductosConFecha(['h1', 'h2']);
    expect(filtros()).toEqual([
      ['select', '*'],
      ['in', 'hogar_id', ['h1', 'h2']],
      ['not', 'fecha_vencimiento', 'is', null],
    ]);
  });
});

describe('aparienciaNotificacion', () => {
  const todos: TipoNotificacion[] = [
    'solicitud_recibida',
    'solicitud_aceptada',
    'solicitud_rechazada',
    'invitacion_recibida',
    'invitacion_aceptada',
    'expulsado',
    'ahora_sos_dueno',
    'por_vencer',
    'vencido',
    'stock_bajo',
    'sin_stock',
    'sugerencia_nueva',
    'sugerencia_aprobada',
    'sugerencia_rechazada',
  ];

  it('tiene ícono y familia para todos los tipos', () => {
    for (const tipo of todos) {
      const { icono, familia } = aparienciaNotificacion(tipo);
      expect(icono).toBeTruthy();
      expect(familia).toBeTruthy();
    }
  });

  it('vencimientos y stock no comparten familia (no se confunden los colores)', () => {
    expect(aparienciaNotificacion('por_vencer').familia).toBe('vencimiento');
    expect(aparienciaNotificacion('stock_bajo').familia).toBe('stock');
    expect(aparienciaNotificacion('solicitud_aceptada').familia).toBe('exito');
  });
});

describe('destinoNotificacion', () => {
  it('vencimientos y stock llevan a la despensa con el filtro que corresponde', () => {
    expect(destinoNotificacion({ tipo: 'vencido', hogar_id: 'h1' })).toEqual({ pantalla: 'despensa', hogarId: 'h1', filtro: 'porVencer' });
    expect(destinoNotificacion({ tipo: 'sin_stock', hogar_id: 'h1' })).toEqual({ pantalla: 'despensa', hogarId: 'h1', filtro: 'stockBajo' });
  });

  it('una solicitud recibida lleva a "Miembros del hogar"', () => {
    expect(destinoNotificacion({ tipo: 'solicitud_recibida', hogar_id: 'h1' })).toEqual({ pantalla: 'miembros', hogarId: 'h1' });
  });

  it('sin hogar (ya no accesible) no lleva a ningún lado', () => {
    expect(destinoNotificacion({ tipo: 'por_vencer', hogar_id: null })).toBeNull();
    expect(destinoNotificacion({ tipo: 'expulsado', hogar_id: null })).toBeNull();
  });

  it('invitaciones/aceptaciones van a inicio y sugerencias nuevas a la pantalla de admin', () => {
    expect(destinoNotificacion({ tipo: 'invitacion_recibida', hogar_id: null })).toEqual({ pantalla: 'inicio' });
    expect(destinoNotificacion({ tipo: 'sugerencia_nueva', hogar_id: null })).toEqual({ pantalla: 'sugerencias' });
  });
});

describe('textoGlobito', () => {
  it('nada sin notificaciones, el número hasta 9 y "9+" después', () => {
    expect(textoGlobito(0)).toBeNull();
    expect(textoGlobito(3)).toBe('3');
    expect(textoGlobito(9)).toBe('9');
    expect(textoGlobito(10)).toBe('9+');
  });
});

describe('tiempoRelativo', () => {
  const ahora = new Date(2026, 9, 12, 10, 0, 0); // 12/10/2026 10:00

  it('minutos y horas', () => {
    expect(tiempoRelativo(new Date(2026, 9, 12, 9, 59, 40).toISOString(), ahora)).toBe('Recién');
    expect(tiempoRelativo(new Date(2026, 9, 12, 9, 55).toISOString(), ahora)).toBe('Hace 5 min');
    expect(tiempoRelativo(new Date(2026, 9, 12, 7, 0).toISOString(), ahora)).toBe('Hace 3 h');
  });

  it('días de calendario: ayer, hace N días y la fecha después de una semana', () => {
    expect(tiempoRelativo(new Date(2026, 9, 11, 8, 0).toISOString(), ahora)).toBe('Ayer');
    expect(tiempoRelativo(new Date(2026, 9, 8, 10, 0).toISOString(), ahora)).toBe('Hace 4 días');
    expect(tiempoRelativo(new Date(2026, 8, 30, 10, 0).toISOString(), ahora)).toBe('30/09');
  });
});

describe('calcularAvisosLocales', () => {
  const ahora = new Date(2026, 9, 12, 10, 0); // 12/10/2026 10:00
  const base = { marca: null, cantidad: 1, alerta_vencimiento_habilitada: true, dias_aviso_vencimiento: null };

  it('avisa a las 9 del día en que entra en la ventana, con los días propios o los generales', () => {
    const avisos = calcularAvisosLocales(
      [
        { ...base, id: 'leche', nombre: 'Leche', fecha_vencimiento: '2026-10-20', dias_aviso_vencimiento: 2 },
        { ...base, id: 'arroz', nombre: 'Arroz', fecha_vencimiento: '2026-11-30', marca: 'Gallo' },
      ],
      7,
      ahora,
    );

    expect(avisos.map((a) => [a.id, a.fecha.getDate(), a.fecha.getMonth() + 1, a.fecha.getHours()])).toEqual([
      ['vence-leche-2026-10-20', 18, 10, 9],
      ['vence-arroz-2026-11-30', 23, 11, 9],
    ]);
    expect(avisos[0].mensaje).toBe('Leche vence en 2 días.');
    expect(avisos[1].mensaje).toBe('Arroz (Gallo) vence en 7 días.');
  });

  it('no programa avisos que ya pasaron, sin fecha, sin alerta o sin cantidad', () => {
    const avisos = calcularAvisosLocales(
      [
        { ...base, id: 'ya', nombre: 'Yogur', fecha_vencimiento: '2026-10-14' }, // ventana empezó el 7/10
        { ...base, id: 'sinFecha', nombre: 'Sal', fecha_vencimiento: null },
        { ...base, id: 'sinAlerta', nombre: 'Queso', fecha_vencimiento: '2026-12-01', alerta_vencimiento_habilitada: false },
        { ...base, id: 'agotado', nombre: 'Pan', fecha_vencimiento: '2026-12-01', cantidad: 0 },
      ],
      7,
      ahora,
    );
    expect(avisos).toEqual([]);
  });

  it('con 1 día dice "mañana" y respeta el máximo de avisos', () => {
    const muchos = Array.from({ length: MAXIMO_AVISOS_LOCALES + 5 }, (_, i) => ({
      ...base,
      id: `p${i}`,
      nombre: 'Leche',
      fecha_vencimiento: '2026-12-01',
      dias_aviso_vencimiento: 1,
    }));
    const avisos = calcularAvisosLocales(muchos, 7, ahora);
    expect(avisos).toHaveLength(MAXIMO_AVISOS_LOCALES);
    expect(avisos[0].mensaje).toBe('Leche vence mañana.');
  });
});
