/**
 * Tests de src/lib/tiempoReal.ts y src/lib/ultimoPedido.ts: agrupar las
 * recargas que piden los avisos de Realtime, decidir si un borrado afecta a
 * la lista, y que una respuesta vieja no pise a una nueva.
 */
import { afectaBorrado, agruparLlamadas } from './tiempoReal';
import { crearUltimoPedido } from './ultimoPedido';

describe('agruparLlamadas', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('varios avisos seguidos se ejecutan una sola vez, al final', () => {
    const fn = jest.fn();
    const recarga = agruparLlamadas(fn, 400);

    for (let i = 0; i < 10; i++) recarga.disparar(); // un ticket de 10 productos
    jest.advanceTimersByTime(399);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cada aviso nuevo reinicia la espera', () => {
    const fn = jest.fn();
    const recarga = agruparLlamadas(fn, 400);
    recarga.disparar();
    jest.advanceTimersByTime(300);
    recarga.disparar();
    jest.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancelar descarta el pedido pendiente (al salir de la pantalla)', () => {
    const fn = jest.fn();
    const recarga = agruparLlamadas(fn, 400);
    recarga.disparar();
    recarga.cancelar();
    jest.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('afectaBorrado', () => {
  it('solo si el producto borrado está en la lista', () => {
    expect(afectaBorrado('p2', ['p1', 'p2'])).toBe(true);
    expect(afectaBorrado('otro', ['p1', 'p2'])).toBe(false);
    expect(afectaBorrado(undefined, ['p1'])).toBe(false);
  });
});

describe('crearUltimoPedido', () => {
  it('una respuesta vieja que llega tarde no es vigente', () => {
    const pedidos = crearUltimoPedido();
    const viejo = pedidos.nuevo();
    const nuevo = pedidos.nuevo();
    expect(pedidos.esVigente(nuevo)).toBe(true);
    expect(pedidos.esVigente(viejo)).toBe(false);
  });

  it('cada instancia lleva su propia cuenta', () => {
    const a = crearUltimoPedido();
    const b = crearUltimoPedido();
    const turnoA = a.nuevo();
    b.nuevo();
    b.nuevo();
    expect(a.esVigente(turnoA)).toBe(true);
  });
});
