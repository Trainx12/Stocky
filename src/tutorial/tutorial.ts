/**
 * Tutorial guiado del inicio: lógica pura (sin React ni Supabase), para
 * poder testearla con Jest. La parte visual está en
 * components/TutorialGuiado.tsx y el "¿querés el tutorial?" en
 * components/BienvenidaTutorialModal.tsx.
 *
 * Funciona como un juego de pasos: cada paso oscurece la pantalla menos un
 * elemento real del inicio (el "objetivo"), le apunta con una flecha y
 * explica en una frase para qué sirve. Algunos pasos invitan a hacerlo de
 * verdad ("Crear mi primer producto"): el tutorial se pausa, la persona lo
 * hace, y al volver al inicio sigue con el paso siguiente. Todo es
 * opcional: se puede saltar en cualquier momento y repetir desde Cuenta o
 * desde la Ayuda.
 */

// Elementos del inicio a los que un paso puede apuntar. Cada uno lo marca
// HomeScreen con useObjetivosTutorial (ref + medición en pantalla).
export type ObjetivoTutorial =
  | 'hogar'
  | 'crearHogar'
  | 'agregarProducto'
  | 'escanearTicket'
  | 'cargarPorVoz'
  | 'porVencer'
  | 'stockBajo'
  | 'campanita'
  | 'ayuda'
  | 'cuenta';

// Lo que hace el botón de acción de un paso (además de "Siguiente").
export type AccionTutorial = 'crearHogar' | 'agregarProducto' | 'escanearTicket' | 'cargarPorVoz' | 'hogarEjemplo';

export interface PasoTutorial {
  id: string;
  // Sin objetivo: el cartel va centrado (bienvenida y final).
  objetivo: ObjetivoTutorial | null;
  titulo: string;
  texto: string;
  // Botón para probarlo de verdad ("Crear mi primer producto"). Pausa el
  // tutorial hasta que se vuelve al inicio.
  accion?: { tipo: AccionTutorial; etiqueta: string };
}

export interface ContextoTutorial {
  tieneHogar: boolean;
}

/**
 * Pasos del tutorial según la situación. Siempre la misma cantidad (si no
 * hay hogar, el paso 2 es "crear hogar" en vez de "tu hogar"), así cuando la
 * persona crea su hogar en el medio, el número de paso no se corre.
 */
export function pasosTutorial({ tieneHogar }: ContextoTutorial): PasoTutorial[] {
  return [
    {
      id: 'bienvenida',
      objetivo: null,
      titulo: '¡Bienvenido a Stocky! 👋',
      texto:
        'Te mostramos lo principal en un minuto: cómo cargar productos, escanear tickets, hablarle a la app y enterarte de lo que vence. Podés salir cuando quieras.',
    },
    tieneHogar
      ? {
          id: 'hogar',
          objetivo: 'hogar',
          titulo: 'Tu hogar',
          texto:
            'Todo pasa dentro de un hogar: ahí se guarda lo que comparten las personas que viven juntas. Con el código invitás a los demás.',
        }
      : {
          id: 'crear-hogar',
          objetivo: 'crearHogar',
          titulo: 'Primero, tu hogar',
          texto:
            'Todo pasa dentro de un hogar. Creá el tuyo, o unite al de alguien con el código que te pasen.',
          accion: { tipo: 'crearHogar', etiqueta: 'Crear mi hogar' },
        },
    {
      id: 'agregar',
      objetivo: 'agregarProducto',
      titulo: 'Tu primer producto',
      texto: 'Elegís el producto del catálogo, la cantidad y, si querés, la fecha de vencimiento. ¡Probemos!',
      accion: { tipo: 'agregarProducto', etiqueta: 'Crear mi primer producto' },
    },
    {
      id: 'ticket',
      objetivo: 'escanearTicket',
      titulo: 'Escanear el ticket',
      texto:
        'Sacale una foto al ticket del súper: Stocky lee los productos solo. Antes de guardar, revisás y corregís lo que haga falta.',
      accion: { tipo: 'escanearTicket', etiqueta: 'Probar con un ticket' },
    },
    {
      id: 'voz',
      objetivo: 'cargarPorVoz',
      titulo: 'Hablale a Stocky',
      texto: 'Decí "compré 2 leches que vencen el viernes" o "usé 3 huevos" y se carga solo. Decí la unidad: "un paquete de sal".',
      accion: { tipo: 'cargarPorVoz', etiqueta: 'Probar por voz' },
    },
    {
      id: 'vencimientos',
      objetivo: 'porVencer',
      titulo: 'Lo que está por vencer',
      texto: 'Acá aparece lo que vence pronto en tu hogar, para usarlo a tiempo. "Ver todos" los ordena por fecha.',
    },
    {
      id: 'stock',
      objetivo: 'stockBajo',
      titulo: 'Stock bajo',
      texto: 'Si a un producto le ponés un stock mínimo, te avisamos cuando queda poco: es tu lista para ir a comprar.',
    },
    {
      id: 'campanita',
      objetivo: 'campanita',
      titulo: 'Avisos',
      texto: 'En la campanita llegan los avisos: vencimientos, stock bajo y personas que quieren entrar a tu hogar. Ahí elegís con cuántos días de anticipación.',
    },
    {
      id: 'ayuda',
      objetivo: 'ayuda',
      titulo: '¿Te perdiste?',
      texto: 'Tocá el signo de pregunta para ver la ayuda. Este tutorial lo podés repetir desde ahí o desde tu cuenta.',
    },
    {
      id: 'final',
      objetivo: null,
      titulo: '¡Listo! 🎉',
      texto:
        'Ya conocés lo principal de Stocky. ¿Querés practicar antes? Probá un hogar de ejemplo (opcional; lo borrás desde el "?").',
      // Opcional: un hogar con productos de muestra (services/hogarEjemplo.ts).
      accion: { tipo: 'hogarEjemplo', etiqueta: 'Probar con un hogar de ejemplo' },
    },
  ];
}

// ---------------------------------------------------------------------------
// Estado: en qué paso va y si está pausado esperando que la persona termine
// de probar algo (crear el hogar, cargar un producto...).
// ---------------------------------------------------------------------------

export interface EstadoTutorial {
  activo: boolean;
  indice: number;
  // Se tocó el botón de acción de un paso: el tutorial se esconde hasta que
  // se vuelve al inicio sin nada abierto.
  pausado: boolean;
  // true apenas se pausa; pasa a false cuando se detecta que la persona
  // efectivamente se fue (otra pantalla o un formulario abierto). Sin esto,
  // el tutorial volvía en el mismo instante, antes de que la navegación
  // llegara a ocurrir.
  esperandoSalida: boolean;
}

export const TUTORIAL_INACTIVO: EstadoTutorial = { activo: false, indice: 0, pausado: false, esperandoSalida: false };

export type EventoTutorial =
  | { tipo: 'iniciar' }
  | { tipo: 'siguiente'; total: number }
  | { tipo: 'anterior' }
  | { tipo: 'terminar' }
  | { tipo: 'pausar' }
  // Se avisa cada vez que cambia si la persona está "ocupada" (fuera del
  // inicio o con un formulario abierto encima).
  | { tipo: 'ocupado'; ocupado: boolean; total: number };

export function tutorialReducer(estado: EstadoTutorial, evento: EventoTutorial): EstadoTutorial {
  switch (evento.tipo) {
    case 'iniciar':
      return { activo: true, indice: 0, pausado: false, esperandoSalida: false };
    case 'terminar':
      return TUTORIAL_INACTIVO;
    case 'siguiente':
      if (!estado.activo) return estado;
      // Pasar del último paso termina el tutorial.
      if (estado.indice >= evento.total - 1) return TUTORIAL_INACTIVO;
      return { ...estado, indice: estado.indice + 1 };
    case 'anterior':
      if (!estado.activo) return estado;
      return { ...estado, indice: Math.max(estado.indice - 1, 0) };
    case 'pausar':
      if (!estado.activo) return estado;
      return { ...estado, pausado: true, esperandoSalida: true };
    case 'ocupado':
      if (!estado.activo || !estado.pausado) return estado;
      if (evento.ocupado) return estado.esperandoSalida ? { ...estado, esperandoSalida: false } : estado;
      // Volvió al inicio, libre: sigue con el paso siguiente (el que probó
      // ya lo vio).
      if (estado.esperandoSalida) return estado;
      return tutorialReducer({ ...estado, pausado: false }, { tipo: 'siguiente', total: evento.total });
  }
}

/** "3 de 10" */
export function textoProgreso(indice: number, total: number): string {
  return `${indice + 1} de ${total}`;
}

// ---------------------------------------------------------------------------
// Dónde dibujar el cartel y la flecha respecto del elemento resaltado.
// ---------------------------------------------------------------------------

export interface Rect {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface UbicacionGlobo {
  // Distancia desde arriba de la pantalla al borde superior del cartel.
  top: number;
  // Dónde está la flecha: arriba del cartel (apunta hacia arriba, el
  // objetivo está encima) o abajo (apunta hacia abajo). null = sin objetivo,
  // cartel centrado.
  flecha: 'arriba' | 'abajo' | null;
  // Centro horizontal de la flecha, alineado con el centro del objetivo
  // (sin salirse del cartel).
  flechaX: number;
}

// Separación entre el objetivo y la flecha/cartel, y margen con los bordes.
export const SEPARACION_GLOBO = 14;
export const MARGEN_PANTALLA = 16;

/**
 * Pone el cartel debajo del objetivo si entra; si no, arriba; y si no entra
 * en ninguno de los dos lados (objetivo enorme), lo apoya abajo de todo de
 * la pantalla. Sin objetivo, centrado.
 */
export function ubicarGlobo(
  objetivo: Rect | null,
  pantalla: { ancho: number; alto: number },
  altoGlobo: number,
): UbicacionGlobo {
  if (!objetivo) {
    return { top: Math.max((pantalla.alto - altoGlobo) / 2, MARGEN_PANTALLA), flecha: null, flechaX: pantalla.ancho / 2 };
  }

  const centroX = objetivo.x + objetivo.ancho / 2;
  const flechaX = Math.min(Math.max(centroX, MARGEN_PANTALLA * 2), pantalla.ancho - MARGEN_PANTALLA * 2);

  const debajo = objetivo.y + objetivo.alto + SEPARACION_GLOBO;
  if (debajo + altoGlobo <= pantalla.alto - MARGEN_PANTALLA) {
    return { top: debajo, flecha: 'arriba', flechaX };
  }

  const encima = objetivo.y - SEPARACION_GLOBO - altoGlobo;
  if (encima >= MARGEN_PANTALLA) {
    return { top: encima, flecha: 'abajo', flechaX };
  }

  return { top: Math.max(pantalla.alto - MARGEN_PANTALLA - altoGlobo, MARGEN_PANTALLA), flecha: null, flechaX };
}

/**
 * Pasa una medida de measureInWindow a coordenadas de la capa del tutorial.
 * En Android la capa (Modal con statusBarTranslucent) empieza en el borde de
 * arriba de la pantalla, pero measureInWindow mide desde ABAJO de la barra
 * de estado: sin restar el origen de la capa, el recuadro quedaba corrido
 * hacia arriba el alto de esa barra (incidentes-sprint10.md #27). En la web y
 * en iOS el origen es (0, 0) y no cambia nada.
 */
export function relativoACapa(objetivo: Rect | null, origenCapa: { x: number; y: number }): Rect | null {
  if (!objetivo) return null;
  return { ...objetivo, x: objetivo.x - origenCapa.x, y: objetivo.y - origenCapa.y };
}

/**
 * Cuánto hay que scrollear para que el objetivo quede a la vista (con lugar
 * para el cartel debajo), o null si ya se ve bien. `scrollActual` es el
 * desplazamiento actual del ScrollView; `zonaVisible` el tramo de pantalla
 * donde se ve el contenido scrolleable (entre el encabezado y la barra de
 * abajo).
 */
export function scrollParaVer(
  objetivo: Rect,
  scrollActual: number,
  zonaVisible: { arriba: number; abajo: number },
  lugarParaGlobo: number,
): number | null {
  const sobraArriba = objetivo.y - zonaVisible.arriba;
  const sobraAbajo = zonaVisible.abajo - (objetivo.y + objetivo.alto);
  // Se ve entero y entra el cartel arriba o abajo: no se mueve nada.
  if (sobraArriba >= 0 && sobraAbajo >= 0 && Math.max(sobraArriba, sobraAbajo) >= lugarParaGlobo) return null;
  // Se lleva el objetivo cerca de la parte de arriba de la zona visible,
  // así el cartel entra debajo.
  return Math.max(scrollActual + sobraArriba - MARGEN_PANTALLA, 0);
}
