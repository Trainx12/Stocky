import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { guardarRespuestaTutorial, leerRespuestaTutorial } from '../services/tutorial';
import { pasosTutorial, scrollParaVer, TUTORIAL_INACTIVO, tutorialReducer } from './tutorial';
import type { AccionTutorial, ObjetivoTutorial, PasoTutorial, Rect } from './tutorial';

// Objetivos que no están dentro del contenido scrolleable del inicio (el "?"
// del encabezado y la barra de abajo): se miden tal cual, sin scrollear.
const OBJETIVOS_FIJOS: ObjetivoTutorial[] = ['campanita', 'ayuda', 'cuenta'];
// Lugar que se deja para el cartel al decidir si hay que scrollear.
const LUGAR_PARA_GLOBO = 230;
// Lo que tarda la animación de scrollTo antes de volver a medir.
const ESPERA_SCROLL_MS = 450;

interface Opciones {
  usuarioId: string | undefined;
  tieneHogar: boolean;
  /** La persona está fuera del inicio o con algo abierto encima (formulario, modal). */
  ocupado: boolean;
  /**
   * Qué hacer con el botón de acción de un paso. Devuelve false si no se
   * pudo (por ejemplo, cargar un producto sin tener hogar): en ese caso el
   * tutorial no se pausa.
   */
  onAccion: (accion: AccionTutorial) => boolean;
}

function medir(nodo: View | null | undefined): Promise<Rect | null> {
  return new Promise((resolver) => {
    if (!nodo) return resolver(null);
    nodo.measureInWindow((x, y, ancho, alto) => resolver(ancho > 0 || alto > 0 ? { x, y, ancho, alto } : null));
  });
}

const esperar = (ms: number) => new Promise((resolver) => setTimeout(resolver, ms));

/**
 * Todo lo que el inicio necesita para el tutorial guiado
 * (src/tutorial/tutorial.ts): la pregunta de la primera vez, en qué paso va,
 * dónde está el elemento que se explica y qué pasa con cada botón.
 *
 * HomeScreen marca cada elemento con `objetivo('agregarProducto')` (callback
 * ref), le pasa `scrollRef`/`zonaScrollRef`/`onScroll` a su ScrollView y
 * dibuja <TutorialGuiado {...guiado} /> y <BienvenidaTutorialModal />.
 */
export function useTutorialInicio({ usuarioId, tieneHogar, ocupado, onAccion }: Opciones) {
  const [estado, despachar] = useReducer(tutorialReducer, TUTORIAL_INACTIVO);
  const pasos = useMemo(() => pasosTutorial({ tieneHogar }), [tieneHogar]);
  const total = pasos.length;
  const paso: PasoTutorial | undefined = pasos[estado.indice];

  // --- Pregunta de la primera vez -----------------------------------------
  // undefined = todavía no se sabe (leyendo); se pregunta solo con null.
  const [respuesta, setRespuesta] = useState<'hecho' | 'saltado' | null | undefined>(undefined);
  useEffect(() => {
    setRespuesta(undefined);
    if (!usuarioId) return;
    let vigente = true;
    leerRespuestaTutorial(usuarioId).then((r) => {
      if (vigente) setRespuesta(r);
    });
    return () => {
      vigente = false;
    };
  }, [usuarioId]);
  const preguntaVisible = respuesta === null && !estado.activo && !ocupado;

  const responder = useCallback(
    (r: 'hecho' | 'saltado') => {
      setRespuesta(r);
      if (usuarioId) guardarRespuestaTutorial(usuarioId, r);
    },
    [usuarioId],
  );

  const iniciar = useCallback(() => despachar({ tipo: 'iniciar' }), []);

  // "Sí, mostrame": se marca como respondida (no se vuelve a preguntar
  // aunque lo corte a la mitad) y arranca.
  const responderQuiero = useCallback(() => {
    responder('saltado');
    iniciar();
  }, [responder, iniciar]);
  const responderYaSe = useCallback(() => responder('saltado'), [responder]);

  // --- Pausa mientras prueba algo -----------------------------------------
  useEffect(() => {
    despachar({ tipo: 'ocupado', ocupado, total });
  }, [ocupado, total]);

  // --- Elementos a señalar ------------------------------------------------
  const nodos = useRef<Partial<Record<ObjetivoTutorial, View | null>>>({});
  const refsPorObjetivo = useRef<Partial<Record<ObjetivoTutorial, (nodo: View | null) => void>>>({});
  // Callback ref estable por objetivo (si cambiara en cada render, React lo
  // desengancha y engancha todo el tiempo).
  const objetivo = useCallback((id: ObjetivoTutorial) => {
    if (!refsPorObjetivo.current[id]) {
      refsPorObjetivo.current[id] = (nodo) => {
        nodos.current[id] = nodo;
      };
    }
    return refsPorObjetivo.current[id]!;
  }, []);

  // --- Scroll del inicio ---------------------------------------------------
  const scrollRef = useRef<ScrollView | null>(null);
  const zonaScrollRef = useRef<View | null>(null);
  const desplazamiento = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    desplazamiento.current = e.nativeEvent.contentOffset.y;
  }, []);

  // --- Medir el objetivo del paso actual ----------------------------------
  const [rect, setRect] = useState<Rect | null>(null);
  const [medido, setMedido] = useState(false);
  const visible = estado.activo && !estado.pausado && !ocupado;
  const objetivoActual = paso?.objetivo ?? null;

  useEffect(() => {
    if (!visible) return;
    let vigente = true;
    setMedido(false);
    (async () => {
      if (!objetivoActual) {
        if (vigente) {
          setRect(null);
          setMedido(true);
        }
        return;
      }
      // Un instante para que el inicio termine de dibujarse (al volver de
      // otra pantalla, o al crear el hogar y aparecer la tarjeta nueva).
      await esperar(60);
      let medida = await medir(nodos.current[objetivoActual]);
      if (medida && !OBJETIVOS_FIJOS.includes(objetivoActual)) {
        const zona = await medir(zonaScrollRef.current);
        if (zona) {
          const destino = scrollParaVer(
            medida,
            desplazamiento.current,
            { arriba: zona.y, abajo: zona.y + zona.alto },
            LUGAR_PARA_GLOBO,
          );
          if (destino !== null) {
            scrollRef.current?.scrollTo({ y: destino, animated: true });
            await esperar(ESPERA_SCROLL_MS);
            medida = await medir(nodos.current[objetivoActual]);
          }
        }
      }
      if (vigente) {
        // Si el elemento no está en pantalla (por ejemplo, la tarjeta del
        // hogar todavía cargando), el cartel va centrado.
        setRect(medida);
        setMedido(true);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [visible, estado.indice, objetivoActual]);

  // --- Botones del cartel --------------------------------------------------
  const siguiente = useCallback(() => {
    if (estado.indice >= total - 1) responder('hecho');
    despachar({ tipo: 'siguiente', total });
  }, [estado.indice, total, responder]);
  const anterior = useCallback(() => despachar({ tipo: 'anterior' }), []);
  const saltar = useCallback(() => despachar({ tipo: 'terminar' }), []);
  const accion = useCallback(() => {
    if (!paso?.accion) return;
    if (onAccion(paso.accion.tipo)) despachar({ tipo: 'pausar' });
  }, [paso, onAccion]);

  return {
    objetivo,
    scrollRef,
    zonaScrollRef,
    onScroll,
    iniciar,
    preguntaVisible,
    responderQuiero,
    responderYaSe,
    // Props de <TutorialGuiado>, o null si no hay que mostrarlo (inactivo,
    // pausado, con algo abierto encima, o todavía midiendo).
    guiado:
      visible && medido && paso
        ? {
            paso,
            indice: estado.indice,
            total,
            objetivo: rect,
            onSiguiente: siguiente,
            onAnterior: anterior,
            onSaltar: saltar,
            onAccion: accion,
          }
        : null,
  };
}
