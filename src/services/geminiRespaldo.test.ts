/**
 * Tests de supabase/functions/_shared/gemini.ts (lo usan vencimiento-foto y
 * voz-a-texto): qué modelo se consulta, cuándo se pasa al de respaldo y cuándo
 * se corta. Gemini se simula con un `fetch` falso que responde después de una
 * demora por modelo; los relojes son falsos para no esperar los segundos de
 * verdad. Ver docs/incidentes-sprint8.md #1 (por qué existe el respaldo en
 * paralelo).
 */
import { consultarGemini } from '../../supabase/functions/_shared/gemini';

type Plan = Record<string, { ms: number; status?: number; cuerpoError?: string }>;

const fetchOriginal = globalThis.fetch;
let llamados: { modelo: string; pensamiento: boolean }[] = [];
let cancelados: string[] = [];

// fetch falso: responde según `plan` después de `ms` (o un error HTTP si tiene
// `status`), y registra los pedidos cancelados por la señal de aborto.
function simular(plan: Plan) {
  globalThis.fetch = jest.fn((url: string, init: RequestInit) => {
    const modelo = String(url).match(/models\/(.*):generateContent/)![1];
    const pensamiento = 'thinkingConfig' in JSON.parse(String(init.body)).generationConfig;
    llamados.push({ modelo, pensamiento });
    const p = plan[modelo];
    return new Promise((resolver, rechazar) => {
      // Como un fetch real: cancelar un pedido que ya respondió no hace nada.
      let respondido = false;
      const t = setTimeout(() => {
        respondido = true;
        if (p.status) {
          resolver(new Response(p.cuerpoError ?? 'error', { status: p.status }));
        } else {
          const texto = JSON.stringify({ modelo });
          resolver(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] })));
        }
      }, p.ms);
      init.signal?.addEventListener('abort', () => {
        if (respondido) return;
        clearTimeout(t);
        cancelados.push(modelo);
        rechazar(new DOMException('Cancelado', 'AbortError'));
      });
    });
  }) as unknown as typeof fetch;
}

// Corre la consulta avanzando el reloj falso hasta que termine.
async function consultar(): Promise<{ modelo?: string; error?: string; ms: number }> {
  const inicio = Date.now();
  let resultado: { modelo?: string; error?: string } | undefined;
  consultarGemini<{ modelo: string }>([{ text: 'hola' }], {}, 'key', 'test').then(
    (r) => (resultado = { modelo: r.modelo }),
    (e: Error) => (resultado = { error: e.message }),
  );
  for (let i = 0; i < 400 && !resultado; i++) await jest.advanceTimersByTimeAsync(100);
  return { ...resultado!, ms: Date.now() - inicio };
}

const RAPIDO = 'gemini-3.5-flash';
const LITE = 'gemini-3.5-flash-lite';
const ULTIMO = 'gemini-3.8-flash';

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  llamados = [];
  cancelados = [];
  delete (globalThis as { Deno?: unknown }).Deno;
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
  globalThis.fetch = fetchOriginal;
});

describe('consultarGemini: pedido a Google', () => {
  beforeEach(() => jest.useRealTimers());

  it('manda la key en el header x-goog-api-key, nunca en la URL', async () => {
    const fetchMock = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] }))),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await consultarGemini([{ text: 'hola' }], {}, 'clave-secreta', 'test');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('clave-secreta');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('clave-secreta');
  });
});

describe('consultarGemini: orden y respaldo', () => {
  it('si el primero responde rápido, usa ese y no consulta a los demás', async () => {
    simular({ [RAPIDO]: { ms: 1000 }, [LITE]: { ms: 100 }, [ULTIMO]: { ms: 100 } });

    const r = await consultar();

    expect(r.modelo).toBe(RAPIDO);
    expect(llamados.map((l) => l.modelo)).toEqual([RAPIDO]);
  });

  it('si el primero tarda más de 5 s, consulta en paralelo al siguiente y gana el que responde antes', async () => {
    simular({ [RAPIDO]: { ms: 12000 }, [LITE]: { ms: 2000 }, [ULTIMO]: { ms: 100 } });

    const r = await consultar();

    expect(r.modelo).toBe(LITE);
    // 5 s de espera + 2 s del respaldo, en vez de esperar al primero (12 s).
    expect(r.ms).toBeGreaterThanOrEqual(7000);
    expect(r.ms).toBeLessThan(8000);
    expect(llamados.map((l) => l.modelo)).toEqual([RAPIDO, LITE]);
    // El primero, que seguía en vuelo, se cancela.
    expect(cancelados).toEqual([RAPIDO]);
  });

  it('si el primero responde antes que el respaldo, gana igual el primero', async () => {
    simular({ [RAPIDO]: { ms: 6000 }, [LITE]: { ms: 4000 }, [ULTIMO]: { ms: 100 } });

    const r = await consultar();

    expect(r.modelo).toBe(RAPIDO);
    expect(cancelados).toEqual([LITE]);
  });

  it('un 503 (saturado) pasa al siguiente sin esperar los 5 s', async () => {
    simular({ [RAPIDO]: { ms: 300, status: 503 }, [LITE]: { ms: 1000 }, [ULTIMO]: { ms: 100 } });

    const r = await consultar();

    expect(r.modelo).toBe(LITE);
    expect(r.ms).toBeLessThan(2000);
  });

  it('un 404 (modelo retirado) o un 429 (sin cuota) también pasan al siguiente', async () => {
    simular({ [RAPIDO]: { ms: 100, status: 404 }, [LITE]: { ms: 100, status: 429 }, [ULTIMO]: { ms: 500 } });

    const r = await consultar();

    expect(r.modelo).toBe(ULTIMO);
    expect(llamados.map((l) => l.modelo)).toEqual([RAPIDO, LITE, ULTIMO]);
  });

  it('una respuesta sin contenido es un error real: no se reintenta con otro modelo', async () => {
    simular({ [RAPIDO]: { ms: 100 }, [LITE]: { ms: 100 }, [ULTIMO]: { ms: 100 } });
    globalThis.fetch = jest.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ candidates: [] }))),
    ) as unknown as typeof fetch;

    const r = await consultar();

    expect(r.error).toBe('Gemini no devolvió contenido.');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('un error real (key inválida) corta sin probar otros modelos', async () => {
    simular({ [RAPIDO]: { ms: 300, status: 401 }, [LITE]: { ms: 100 }, [ULTIMO]: { ms: 100 } });

    const r = await consultar();

    expect(r.error).toMatch(/401/);
    expect(llamados.map((l) => l.modelo)).toEqual([RAPIDO]);
  });

  it('si todos están saturados, devuelve el último error', async () => {
    simular({ [RAPIDO]: { ms: 100, status: 503 }, [LITE]: { ms: 100, status: 429 }, [ULTIMO]: { ms: 100, status: 503 } });

    const r = await consultar();

    expect(r.error).toMatch(/503/);
    expect(llamados.map((l) => l.modelo)).toEqual([RAPIDO, LITE, ULTIMO]);
  });

  it('si un modelo no acepta el nivel de pensamiento (400), lo reintenta sin él', async () => {
    let primera = true;
    simular({ [RAPIDO]: { ms: 100 }, [LITE]: { ms: 100 }, [ULTIMO]: { ms: 100 } });
    const fetchSimulado = globalThis.fetch as jest.Mock;
    globalThis.fetch = jest.fn((url: string, init: RequestInit) => {
      if (primera) {
        primera = false;
        llamados.push({ modelo: RAPIDO, pensamiento: true });
        return Promise.resolve(new Response('thinking no soportado', { status: 400 }));
      }
      return fetchSimulado(url, init);
    }) as unknown as typeof fetch;

    const r = await consultar();

    expect(r.modelo).toBe(RAPIDO);
    expect(llamados).toEqual([
      { modelo: RAPIDO, pensamiento: true },
      { modelo: RAPIDO, pensamiento: false },
    ]);
  });

  it('respeta la lista del secret GEMINI_MODEL', async () => {
    (globalThis as { Deno?: unknown }).Deno = { env: { get: () => `${ULTIMO}, ${LITE}` } };
    simular({ [RAPIDO]: { ms: 100 }, [LITE]: { ms: 100 }, [ULTIMO]: { ms: 100 } });

    const r = await consultar();

    expect(r.modelo).toBe(ULTIMO);
    expect(llamados.map((l) => l.modelo)).toEqual([ULTIMO]);
  });
});
