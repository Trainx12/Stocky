/**
 * Tests de src/tutorial/tutorial.ts (pasos, avance/pausa, ubicación del
 * cartel y scroll) y de services/tutorial.ts (la respuesta a "¿querés el
 * tutorial?", guardada por cuenta).
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const datos: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in datos ? datos[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => {
        datos[k] = v;
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MARGEN_PANTALLA,
  pasosTutorial,
  relativoACapa,
  scrollParaVer,
  SEPARACION_GLOBO,
  textoProgreso,
  TUTORIAL_INACTIVO,
  tutorialReducer,
  ubicarGlobo,
} from './tutorial';
import type { EstadoTutorial } from './tutorial';
import { guardarRespuestaTutorial, leerRespuestaTutorial } from '../services/tutorial';

describe('pasosTutorial', () => {
  it('con o sin hogar tiene la misma cantidad de pasos (crear el hogar no corre el número)', () => {
    expect(pasosTutorial({ tieneHogar: true })).toHaveLength(pasosTutorial({ tieneHogar: false }).length);
  });

  it('sin hogar, el segundo paso invita a crearlo; con hogar, lo explica', () => {
    expect(pasosTutorial({ tieneHogar: false })[1]).toMatchObject({ objetivo: 'crearHogar', accion: { tipo: 'crearHogar' } });
    expect(pasosTutorial({ tieneHogar: true })[1]).toMatchObject({ objetivo: 'hogar' });
    expect(pasosTutorial({ tieneHogar: true })[1].accion).toBeUndefined();
  });

  it('muestra carga a mano, ticket (OCR), voz y vencimientos, y termina con un cierre centrado', () => {
    const pasos = pasosTutorial({ tieneHogar: true });
    expect(pasos.map((p) => p.objetivo)).toEqual(
      expect.arrayContaining(['agregarProducto', 'escanearTicket', 'cargarPorVoz', 'porVencer', 'stockBajo', 'campanita']),
    );
    expect(pasos[0].objetivo).toBeNull();
    expect(pasos[pasos.length - 1].objetivo).toBeNull();
    expect(pasos.find((p) => p.id === 'agregar')?.accion?.tipo).toBe('agregarProducto');
  });

  it('ids únicos y textos cortos (es un cartel, no un manual)', () => {
    const pasos = pasosTutorial({ tieneHogar: true });
    expect(new Set(pasos.map((p) => p.id)).size).toBe(pasos.length);
    for (const p of pasos) expect(p.texto.length).toBeLessThanOrEqual(180);
  });
});

describe('tutorialReducer', () => {
  const total = 5;
  const enPaso = (indice: number): EstadoTutorial => ({ activo: true, indice, pausado: false, esperandoSalida: false });

  it('iniciar arranca en el primer paso; siguiente y anterior se mueven', () => {
    let e = tutorialReducer(TUTORIAL_INACTIVO, { tipo: 'iniciar' });
    expect(e).toEqual(enPaso(0));
    e = tutorialReducer(e, { tipo: 'siguiente', total });
    expect(e.indice).toBe(1);
    e = tutorialReducer(e, { tipo: 'anterior' });
    e = tutorialReducer(e, { tipo: 'anterior' });
    expect(e.indice).toBe(0);
  });

  it('siguiente en el último paso termina; terminar (saltar) también', () => {
    expect(tutorialReducer(enPaso(total - 1), { tipo: 'siguiente', total })).toEqual(TUTORIAL_INACTIVO);
    expect(tutorialReducer(enPaso(2), { tipo: 'terminar' })).toEqual(TUTORIAL_INACTIVO);
  });

  it('pausado: no vuelve en el mismo instante, sino después de salir y volver', () => {
    let e = tutorialReducer(enPaso(2), { tipo: 'pausar' });
    // Todavía en el inicio (la navegación no ocurrió): sigue pausado.
    e = tutorialReducer(e, { tipo: 'ocupado', ocupado: false, total });
    expect(e).toMatchObject({ pausado: true, indice: 2 });
    // Se fue a cargar el producto.
    e = tutorialReducer(e, { tipo: 'ocupado', ocupado: true, total });
    expect(e).toMatchObject({ pausado: true, esperandoSalida: false });
    // Volvió: sigue con el paso siguiente.
    e = tutorialReducer(e, { tipo: 'ocupado', ocupado: false, total });
    expect(e).toEqual(enPaso(3));
  });

  it('sin tutorial activo, los eventos no hacen nada', () => {
    expect(tutorialReducer(TUTORIAL_INACTIVO, { tipo: 'siguiente', total })).toBe(TUTORIAL_INACTIVO);
    expect(tutorialReducer(TUTORIAL_INACTIVO, { tipo: 'pausar' })).toBe(TUTORIAL_INACTIVO);
    expect(tutorialReducer(TUTORIAL_INACTIVO, { tipo: 'ocupado', ocupado: false, total })).toBe(TUTORIAL_INACTIVO);
  });

  it('abrir algo sin haber pausado no avanza el tutorial', () => {
    const e = tutorialReducer(enPaso(1), { tipo: 'ocupado', ocupado: true, total });
    expect(tutorialReducer(e, { tipo: 'ocupado', ocupado: false, total })).toEqual(enPaso(1));
  });
});

describe('textoProgreso', () => {
  it('cuenta desde 1', () => {
    expect(textoProgreso(0, 10)).toBe('1 de 10');
    expect(textoProgreso(9, 10)).toBe('10 de 10');
  });
});

describe('ubicarGlobo', () => {
  const pantalla = { ancho: 400, alto: 800 };

  it('sin objetivo, centrado y sin flecha', () => {
    expect(ubicarGlobo(null, pantalla, 200)).toEqual({ top: 300, flecha: null, flechaX: 200 });
  });

  it('si entra, va debajo del objetivo con la flecha apuntando hacia arriba', () => {
    const u = ubicarGlobo({ x: 20, y: 100, ancho: 100, alto: 50 }, pantalla, 200);
    expect(u).toEqual({ top: 150 + SEPARACION_GLOBO, flecha: 'arriba', flechaX: 70 });
  });

  it('si no entra debajo (objetivo abajo de todo, como la campanita), va arriba', () => {
    const u = ubicarGlobo({ x: 180, y: 740, ancho: 44, alto: 44 }, pantalla, 200);
    expect(u.flecha).toBe('abajo');
    expect(u.top).toBe(740 - SEPARACION_GLOBO - 200);
  });

  it('la flecha no se sale por los costados', () => {
    expect(ubicarGlobo({ x: 0, y: 100, ancho: 10, alto: 10 }, pantalla, 200).flechaX).toBe(MARGEN_PANTALLA * 2);
    expect(ubicarGlobo({ x: 390, y: 100, ancho: 10, alto: 10 }, pantalla, 200).flechaX).toBe(400 - MARGEN_PANTALLA * 2);
  });

  it('objetivo enorme: el cartel se apoya abajo de la pantalla', () => {
    const u = ubicarGlobo({ x: 0, y: 50, ancho: 400, alto: 700 }, pantalla, 200);
    expect(u).toMatchObject({ top: 800 - MARGEN_PANTALLA - 200, flecha: null });
  });
});

describe('relativoACapa', () => {
  it('resta el origen de la capa (Android: la barra de estado)', () => {
    expect(relativoACapa({ x: 10, y: 300, ancho: 50, alto: 40 }, { x: 0, y: -24 })).toEqual({ x: 10, y: 324, ancho: 50, alto: 40 });
    expect(relativoACapa({ x: 10, y: 300, ancho: 50, alto: 40 }, { x: 0, y: 0 })).toEqual({ x: 10, y: 300, ancho: 50, alto: 40 });
    expect(relativoACapa(null, { x: 0, y: 5 })).toBeNull();
  });
});

describe('scrollParaVer', () => {
  const zona = { arriba: 100, abajo: 700 };

  it('si se ve y hay lugar para el cartel, no scrollea', () => {
    expect(scrollParaVer({ x: 0, y: 150, ancho: 100, alto: 80 }, 0, zona, 230)).toBeNull();
  });

  it('si está más abajo de lo visible, scrollea hasta acercarlo arriba', () => {
    expect(scrollParaVer({ x: 0, y: 900, ancho: 100, alto: 80 }, 200, zona, 230)).toBe(200 + 800 - MARGEN_PANTALLA);
  });

  it('si quedó arriba (scrolleado de más), vuelve sin pasarse de 0', () => {
    expect(scrollParaVer({ x: 0, y: 20, ancho: 100, alto: 80 }, 50, zona, 230)).toBe(0);
  });
});

describe('respuesta al tutorial (services/tutorial.ts)', () => {
  it('nunca respondida = null; después queda guardada por cuenta', async () => {
    await expect(leerRespuestaTutorial('ana')).resolves.toBeNull();
    await guardarRespuestaTutorial('ana', 'hecho');
    await expect(leerRespuestaTutorial('ana')).resolves.toBe('hecho');
    await expect(leerRespuestaTutorial('beto')).resolves.toBeNull();
  });

  it('sin almacenamiento, no insiste con la pregunta', async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('sin storage'));
    await expect(leerRespuestaTutorial('carla')).resolves.toBe('saltado');
  });
});
