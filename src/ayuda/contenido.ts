/**
 * Contenido de la ayuda (botón "?" arriba a la derecha del Home, pantalla
 * AyudaScreen). Igual que src/legal/, el texto vive como datos separado de
 * la pantalla: cambiar una explicación es editar este archivo.
 *
 * Cada paso nombra el botón con el MISMO texto o ícono que se ve en la app.
 * Si se cambia el nombre de un botón, actualizarlo acá también (el test
 * ayuda.test.ts verifica que cada tema tenga pasos y el ícono exista).
 */

export interface TemaAyuda {
  id: string;
  titulo: string;
  // Ícono de Ionicons que acompaña el título del tema.
  icono: string;
  // Una línea que explica para qué sirve, antes de los pasos.
  resumen: string;
  pasos: string[];
  // Un consejo opcional al final.
  consejo?: string;
}

export const TEMAS_AYUDA: TemaAyuda[] = [
  {
    id: 'primeros-pasos',
    titulo: 'Crear tu hogar o unirte a uno',
    icono: 'home-outline',
    resumen: 'Todo en Stocky pasa dentro de un hogar: ahí se guardan los productos que comparten las personas que viven juntas.',
    pasos: [
      'En el inicio, debajo de "Tus hogares activos", tocá "Crear hogar", escribí un nombre (por ejemplo "Casa") y tocá "Crear hogar".',
      'Si otra persona ya creó el hogar, tocá "Unirme a un hogar", escribí el código que te pasaron y tocá "Unirme". El dueño tiene que aceptarte.',
      'El código de tu hogar aparece debajo de su nombre ("Código: ..."): pasáselo a quien quieras sumar.',
      'Si tenés más de un hogar, tocá "Cambiar hogar" para elegir cuál ver. Stocky se acuerda del que elegiste la próxima vez que abras la app o la página.',
    ],
    consejo: '¿Preferís que te lo muestren? Arriba de esta pantalla tocá "Ver el tutorial guiado".',
  },
  {
    id: 'miembros',
    titulo: 'Invitar y aceptar personas',
    icono: 'people-outline',
    resumen: 'El dueño del hogar decide quién entra.',
    pasos: [
      'En "Tus hogares activos", tocá el ícono de personas al lado del nombre del hogar para abrir los miembros.',
      'Para invitar a alguien, escribí su mail en "Invitar por mail" y tocá "Invitar": le llega la invitación en su inicio.',
      'Si alguien pidió unirse con el código, aparece en "Solicitudes pendientes": tocá el tilde para aceptarlo o la cruz para rechazarlo.',
      'Ahí mismo podés dejar que un invitado edite el nombre del hogar, pasarle el rol de dueño ("Hacer dueño") o sacarlo ("Quitar").',
    ],
    consejo: 'Cuando alguien quiere unirse, también te llega una notificación a la campanita.',
  },
  {
    id: 'agregar-a-mano',
    titulo: 'Agregar un producto a mano',
    icono: 'add-circle-outline',
    resumen: 'La forma más simple de cargar algo que compraste.',
    pasos: [
      'En el inicio, en "Accesos rápidos", tocá "Agregar producto" (o, dentro de la despensa, el botón violeta con el "+").',
      'Tocá "Tocá para elegir un producto del catálogo" y buscá el producto por su nombre.',
      'Completá la cantidad y, si querés, la marca, el stock mínimo y la fecha de vencimiento.',
      'Tocá "Agregar producto".',
    ],
    consejo: '¿No está en el catálogo? Abajo de la lista tocá "¿No encontrás tu producto? Sugerilo": un administrador lo revisa y lo suma.',
  },
  {
    id: 'ticket',
    titulo: 'Cargar productos con la foto de un ticket',
    icono: 'receipt-outline',
    resumen: 'Sacale una foto al ticket del súper y Stocky reconoce los productos.',
    pasos: [
      'En "Accesos rápidos", tocá "Escanear ticket" (o, dentro de la despensa, el ícono del ticket arriba a la derecha).',
      'Tocá "Sacar foto" (o "Elegir de la galería") y fotografiá el ticket bien plano y con buena luz.',
      'Revisá la lista: si un producto se leyó mal, tocá "Cambiar producto" para elegir el correcto o "Escribir a mano" para corregir el nombre. También podés cambiar la cantidad, la marca y la fecha de vencimiento, o descartarlo con el tacho.',
      'Lo que no se reconoció aparece como "No reconocido": tocá "Agregar igual" si querés guardarlo.',
      'Tocá "Agregar N productos" para guardar.',
    ],
    consejo: 'Nada se guarda sin que lo confirmes: si algo salió mal, cerrá y probá con otra foto.',
  },
  {
    id: 'voz',
    titulo: 'Cargar o cambiar productos hablando',
    icono: 'mic-outline',
    resumen: 'Decí en voz alta qué compraste, qué usaste o qué se terminó.',
    pasos: [
      'En "Accesos rápidos", tocá "Cargar por voz" (o el micrófono dentro de la despensa).',
      'Tocá el micrófono, hablá y volvé a tocarlo para terminar. Por ejemplo: "Compré 2 leches que vencen el 15 de noviembre", "Usé 3 huevos" o "Eliminá el yogur".',
      'Decí la unidad o el envase para que la cargue bien: "un paquete de sal", "2 cajas de chocolatada", "medio kilo de queso". En la revisión podés cambiar la unidad tocándola.',
      'Revisá lo que entendió y tocá "Aplicar" (el botón dice cuántos cambios va a hacer). Si no entendió bien, tocá "Grabar de nuevo".',
    ],
    consejo: 'Si decís algo que no es comida (por ejemplo "shampoo"), te avisa y no lo carga salvo que toques "Cargar igual".',
  },
  {
    id: 'vencimientos',
    titulo: 'Fechas de vencimiento y avisos',
    icono: 'time-outline',
    resumen: 'Stocky te avisa antes de que algo se venza.',
    pasos: [
      'En el formulario del producto, en "Fecha de vencimiento", escribí la fecha (solo los números) o usá los botones de abajo: "Calendario", "Foto" (le sacás una foto a la fecha impresa en el envase) o "Dictar".',
      'Los productos que están por vencer aparecen en el inicio, en "Productos próximos a vencer" (del hogar que estás usando). Tocá "Ver todos" para verlos ordenados por fecha.',
      'Si tenés varios hogares y querés ver en el inicio lo que vence en todos, entrá a la campanita y prendé "Alertas de todos mis hogares".',
      'En la despensa, el botón "Por vencer" muestra todos los productos con fecha, del que vence primero al último.',
      'Para elegir con cuántos días de anticipación te avisa, entrá a la campanita y usá los botones − y + de "Avisarme antes de que venza". Para un producto puntual, completá "Días de anticipación" en su formulario.',
    ],
  },
  {
    id: 'stock',
    titulo: 'Stock mínimo: saber qué te falta',
    icono: 'trending-down-outline',
    resumen: 'Te avisa cuando queda poco de algo que siempre querés tener.',
    pasos: [
      'En el formulario del producto, completá "Stock mínimo" (por ejemplo 2 para la leche).',
      'Cuando queda menos que eso, el producto se marca en amarillo como "Stock bajo" (o "Sin stock" si se terminó) y te llega una notificación.',
      'En la despensa, el botón "Stock bajo" muestra solo lo que te falta: tu lista para ir a comprar.',
      'Usá los botones − y + al lado de cada producto para restar o sumar de a uno sin abrir el formulario.',
    ],
  },
  {
    id: 'notificaciones',
    titulo: 'Notificaciones',
    icono: 'notifications-outline',
    resumen: 'La campanita de la barra de abajo junta todo lo importante.',
    pasos: [
      'Tocá la campanita: el número rojo indica cuántas notificaciones no leíste.',
      'Tocá una notificación para ir directo a lo que avisa (por ejemplo, a los productos por vencer).',
      'Para recibirlas también con la app cerrada, en la campanita tocá "Activar" en "Avisos en el teléfono" y aceptá el permiso.',
    ],
  },
  {
    id: 'cuenta',
    titulo: 'Tu cuenta: modo oscuro, varias cuentas y cerrar sesión',
    icono: 'person-circle-outline',
    resumen: 'Todo lo de tu cuenta está en el botón de la persona, en la barra de abajo.',
    pasos: [
      'Tocá el lápiz al lado de tu nombre para cambiar cómo te ven en tus hogares.',
      'En "Apariencia" elegí "Sistema" (igual que tu celular), "Claro" u "Oscuro".',
      'En "Tus cuentas", tocá "Agregar otra cuenta" para entrar con otra cuenta de Google, y tocá cualquiera para cambiar entre ellas sin volver a iniciar sesión.',
      'Abajo de todo está "Cerrar sesión". Más abajo, "Borrar mi cuenta" la borra para siempre (te lo preguntamos dos veces).',
      '¿Una idea o algo que falló? Tocá "Contanos qué mejorar": lo lee el equipo de Stocky.',
    ],
  },
];

// Filtra los temas por una búsqueda (sin distinguir mayúsculas ni tildes),
// en el título, el resumen y los pasos. Vacía = todos.
export function buscarEnAyuda(temas: TemaAyuda[], busqueda: string): TemaAyuda[] {
  const normalizar = (texto: string) =>
    texto
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .trim();
  const buscado = normalizar(busqueda);
  if (!buscado) return temas;
  return temas.filter((t) => normalizar([t.titulo, t.resumen, ...t.pasos, t.consejo ?? ''].join(' ')).includes(buscado));
}
