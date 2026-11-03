/**
 * Términos y Condiciones y Política de Privacidad de Stocky.
 *
 * Todo el texto legal vive en esta carpeta (src/legal/) como datos, separado
 * de la pantalla que lo muestra (TerminosScreen): así cambiarlo es editar
 * este archivo, no tocar componentes.
 *
 * IMPORTANTE: es un borrador redactado por el equipo para el proyecto, no
 * asesoramiento legal. Antes de publicar la app en las tiendas conviene que
 * lo revise un profesional (ver docs/incidentes-sprint10.md, sección de
 * términos).
 *
 * Si se cambia algo de fondo (qué datos se usan, para qué, con quién se
 * comparten), hay que subir VERSION_TERMINOS: a todos los usuarios se les va
 * a volver a pedir que acepten la versión nueva (ver services/terminos.ts).
 */

// Versión vigente. Se guarda en usuarios.terminos_version al aceptar.
export const VERSION_TERMINOS = '2026-10-15';

// Fecha legible de la última actualización (se muestra arriba del texto).
export const FECHA_TERMINOS = '13 de octubre de 2026';

export interface SeccionLegal {
  titulo: string;
  parrafos: string[];
}

export const SECCIONES_TERMINOS: SeccionLegal[] = [
  {
    titulo: '1. Aceptación',
    parrafos: [
      'Estos Términos y Condiciones y la Política de Privacidad incluida en ellos regulan el uso de Stocky, una aplicación para organizar el inventario de alimentos de un hogar. Al tocar "Acepto" y usar la aplicación, declarás que los leíste, que los entendiste y que estás de acuerdo con ellos. Si no estás de acuerdo, no uses la aplicación.',
      'Para usar Stocky tenés que ser mayor de 13 años. Si sos menor de edad, necesitás la autorización de tu madre, padre o tutor.',
    ],
  },
  {
    titulo: '2. Tu cuenta',
    parrafos: [
      'Para entrar a Stocky iniciás sesión con tu cuenta de Google. Sos responsable de lo que se haga con tu cuenta y de mantener seguro el acceso a ella.',
      'Los administradores de Stocky pueden deshabilitar una cuenta que incumpla estos términos (por ejemplo, por un uso abusivo o por cargar contenido ofensivo o ajeno). Deshabilitar una cuenta no borra sus datos.',
    ],
  },
  {
    titulo: '3. Qué información usamos',
    parrafos: [
      'Datos de tu cuenta: tu nombre y tu correo electrónico, que nos comparte Google al iniciar sesión, y la foto de perfil que elijas subir (es opcional y la podés cambiar o quitar cuando quieras desde Cuenta).',
      'Datos que cargás en la app: los hogares que creás o a los que te unís, sus miembros, los productos de cada hogar (nombre, marca, cantidad, stock mínimo, fecha de vencimiento) y la actividad sobre ellos (quién agregó, modificó o eliminó cada producto).',
      'Comentarios: lo que nos escribís en "Contanos qué mejorar", junto con el tipo de teléfono (Android, iPhone o web) y la versión de la app. Los leen los administradores de Stocky para mejorar la app.',
      'Fotos y audios: las fotos de tickets y de fechas de vencimiento, y los audios que grabás para cargar productos por voz, se envían a servicios de reconocimiento de texto y de voz (ver punto 6) solo para interpretarlos en ese momento; Stocky no los guarda. Las fotos que adjuntás al sugerir un producto para el catálogo sí se guardan (ver punto 5), igual que tu foto de perfil, si subís una.',
      'Preferencias y notificaciones: tus preferencias de aviso (por ejemplo, con cuántos días de anticipación avisarte de un vencimiento), las notificaciones que te enviamos y, si las activás, un identificador de tu teléfono para mandarte notificaciones.',
    ],
  },
  {
    titulo: '4. Para qué usamos la información',
    parrafos: [
      'Para que la app funcione: mostrarte tu inventario y el de los hogares que compartís, avisarte de vencimientos, de stock bajo y de novedades de tus hogares, e interpretar tickets, fotos y comandos de voz.',
      'Para mejorar Stocky: podemos usar la información que se carga en la app (por ejemplo, qué productos se cargan, cómo se usan las funciones, qué tickets no se leyeron bien) para corregir errores, mejorar el reconocimiento de tickets y de voz, completar y mejorar el catálogo de productos y desarrollar funciones o productos nuevos. Cuando esa información se use fuera de tu propio hogar (estadísticas, catálogo, mejoras generales), se usa de forma agregada o sin datos que te identifiquen personalmente.',
      'Para administrar la plataforma: los administradores pueden ver la lista de usuarios, habilitar o deshabilitar cuentas y revisar las sugerencias del catálogo.',
      'No vendemos tus datos personales ni los usamos para publicidad.',
    ],
  },
  {
    titulo: '5. Contenido que aportás: sugerencias y fotos',
    parrafos: [
      'Si un producto no está en el catálogo, podés sugerirlo, con una foto opcional. Las sugerencias las revisan los administradores de Stocky, que deciden si se aprueban (y pasan a estar disponibles para todos los usuarios) o se rechazan. Pueden corregir el nombre, la categoría o la unidad antes de aprobarlas.',
      'Al enviar una sugerencia o una foto, nos otorgás una licencia gratuita, no exclusiva, por tiempo indefinido y válida en cualquier país para usarla, copiarla, modificarla (por ejemplo, recortarla o achicarla) y mostrarla dentro de Stocky, en su catálogo de productos y en versiones o productos futuros de Stocky. Seguís siendo titular de lo que aportás.',
      'Solo podés enviar fotos que hayas sacado vos o que tengas derecho a compartir, sin personas reconocibles ni datos personales. No envíes contenido ofensivo, ilegal o que infrinja derechos de otros.',
      'Tu foto de perfil es tuya: Stocky solo la usa para mostrarla dentro de la app (no entra en la licencia de arriba) y la borra cuando la quitás o borrás tu cuenta. Tiene que ser una foto tuya o una imagen que tengas derecho a usar, sin contenido ofensivo, y no puede mostrar a otras personas sin su permiso.',
    ],
  },
  {
    titulo: '6. Servicios de terceros',
    parrafos: [
      'Para funcionar, Stocky usa servicios de otras empresas, que procesan datos en nuestro nombre y pueden estar ubicados fuera de la Argentina:',
      '• Supabase: base de datos, inicio de sesión y almacenamiento de la app.',
      '• Google: inicio de sesión con tu cuenta de Google, y Gemini (inteligencia artificial de Google) para leer fechas de vencimiento en fotos e interpretar los comandos de voz.',
      '• OCR.space: lectura del texto de las fotos de tickets.',
      '• Expo y Firebase Cloud Messaging (Google): envío de notificaciones al teléfono.',
      'Cada uno de estos servicios tiene sus propias políticas de privacidad. Solo les mandamos lo necesario para cada función.',
    ],
  },
  {
    titulo: '7. Hogares compartidos',
    parrafos: [
      'Todo lo que cargás en un hogar lo ven sus demás miembros: los productos, sus cantidades y vencimientos, la actividad (con tu nombre) y la lista de miembros. Tu nombre, tu correo y tu foto de perfil (si subiste una) los ve el dueño del hogar al que pedís unirte o que te invita. Los administradores de Stocky también ven tu nombre, tu correo y tu foto en la lista de usuarios. La foto se guarda con un enlace público: quien tenga ese enlace puede verla.',
      'Si salís de un hogar o te sacan, dejás de ver su información; los productos que cargaste quedan en el hogar.',
    ],
  },
  {
    titulo: '8. Tus derechos sobre tus datos',
    parrafos: [
      'De acuerdo con la Ley 25.326 de Protección de Datos Personales, podés pedir acceso a tus datos, que los corrijamos o que los eliminemos, contactando al equipo de Stocky.',
      'Podés borrar tu cuenta cuando quieras desde Cuenta → "Borrar mi cuenta". Se borran tu perfil, tu foto de perfil, tus notificaciones y tu lugar en cada hogar. Si eras dueño de un hogar con más personas, pasa a ser dueño el miembro más antiguo; los hogares donde estabas solo se borran con todos sus productos. Los productos y la actividad que cargaste en hogares compartidos quedan en esos hogares sin tu nombre, y tus comentarios quedan sin autor.',
      'La Agencia de Acceso a la Información Pública, órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que se interpongan con relación al incumplimiento de las normas sobre protección de datos personales.',
    ],
  },
  {
    titulo: '9. Información de la app: revisala siempre',
    parrafos: [
      'Stocky te ayuda a organizarte, pero no reemplaza tu criterio. La lectura de tickets, de fechas en fotos y de comandos de voz es automática y puede equivocarse: revisá siempre lo que se va a guardar. Las alertas de vencimiento dependen de las fechas que se cargaron y de que la app y las notificaciones funcionen.',
      'Antes de consumir un alimento, verificá su fecha de vencimiento y su estado en el envase. Stocky no se responsabiliza por el consumo de alimentos vencidos o en mal estado, ni por compras hechas según la información de la app.',
    ],
  },
  {
    titulo: '10. Uso aceptable',
    parrafos: [
      'No uses Stocky para fines ilegales, para molestar a otras personas, para intentar acceder a hogares o datos ajenos, ni para interferir con el funcionamiento de la app (por ejemplo, con pedidos automatizados masivos).',
    ],
  },
  {
    titulo: '11. Disponibilidad y responsabilidad',
    parrafos: [
      'Stocky se ofrece "tal como está". Hacemos lo posible para que funcione bien, pero puede tener errores, interrupciones o cambios, y algunas funciones dependen de servicios de terceros. En la medida en que la ley lo permita, el equipo de Stocky no se responsabiliza por daños derivados del uso o de la imposibilidad de usar la app.',
    ],
  },
  {
    titulo: '12. Cambios en estos términos',
    parrafos: [
      'Podemos actualizar estos términos. Si el cambio es importante, te vamos a pedir que aceptes la versión nueva la próxima vez que abras la app; si no la aceptás, no vas a poder seguir usándola. Siempre podés leer la versión vigente desde la pantalla de inicio.',
    ],
  },
  {
    titulo: '13. Ley aplicable',
    parrafos: [
      'Estos términos se rigen por las leyes de la República Argentina. Cualquier conflicto se resolverá ante los tribunales competentes de la Argentina, sin perjuicio de los derechos que te correspondan como consumidor.',
    ],
  },
];

// Lo que usamos para hacer Stocky (se muestra al final, en "Créditos").
export interface RecursoUsado {
  nombre: string;
  detalle: string;
  url: string;
}

export const SERVICIOS_USADOS: RecursoUsado[] = [
  { nombre: 'Supabase', detalle: 'Base de datos, autenticación, almacenamiento y funciones', url: 'https://supabase.com' },
  { nombre: 'Google Sign-In', detalle: 'Inicio de sesión', url: 'https://developers.google.com/identity' },
  { nombre: 'Google Gemini', detalle: 'Lectura de fechas en fotos y comandos de voz', url: 'https://ai.google.dev' },
  { nombre: 'OCR.space', detalle: 'Lectura de tickets de compra', url: 'https://ocr.space' },
  { nombre: 'Expo / EAS', detalle: 'Plataforma de la app y notificaciones push', url: 'https://expo.dev' },
  { nombre: 'Open Food Facts', detalle: 'Fotos de productos (CC BY-SA 3.0)', url: 'https://world.openfoodfacts.org' },
  { nombre: 'Wikimedia Commons', detalle: 'Fotos de productos (licencia de cada archivo)', url: 'https://commons.wikimedia.org' },
];

export const SOFTWARE_USADO: RecursoUsado[] = [
  { nombre: 'React Native y React', detalle: 'Licencia MIT', url: 'https://reactnative.dev' },
  { nombre: 'Expo SDK', detalle: 'Licencia MIT', url: 'https://github.com/expo/expo' },
  { nombre: 'React Navigation', detalle: 'Licencia MIT', url: 'https://reactnavigation.org' },
  { nombre: 'supabase-js', detalle: 'Licencia MIT', url: 'https://github.com/supabase/supabase-js' },
  { nombre: 'Ionicons (@expo/vector-icons)', detalle: 'Íconos, licencia MIT', url: 'https://ionic.io/ionicons' },
  { nombre: 'Poppins y Baloo 2 (Google Fonts)', detalle: 'Tipografías, SIL Open Font License', url: 'https://fonts.google.com' },
  { nombre: 'AsyncStorage', detalle: 'Licencia MIT', url: 'https://github.com/react-native-async-storage/async-storage' },
  { nombre: 'heic2any', detalle: 'Conversión de fotos HEIC, licencia MIT', url: 'https://github.com/alexcorvi/heic2any' },
];
