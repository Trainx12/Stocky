import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList, FiltroAlerta } from '../types/navigation';
import { ScreenContainer } from '../components/ScreenContainer';
import { Header } from '../components/Header';
import { SectionCard } from '../components/SectionCard';
import { BadgeVencimiento } from '../components/BadgeVencimiento';
import { BottomNavBar } from '../components/BottomNavBar';
import type { TabKey } from '../components/BottomNavBar';
import { CatalogoSelectorModal } from '../components/CatalogoSelectorModal';
import { HogarFormModal } from '../components/HogarFormModal';
import { HogarMiembrosModal } from '../components/HogarMiembrosModal';
import { SeleccionarHogarModal } from '../components/SeleccionarHogarModal';
import { Button } from '../components/Button';
import { NombreDeHogar } from '../components/Logo';
import { TutorialGuiado } from '../components/TutorialGuiado';
import { BienvenidaTutorialModal } from '../components/BienvenidaTutorialModal';
import { useTutorialInicio } from '../tutorial/useTutorialInicio';
import type { AccionTutorial } from '../tutorial/tutorial';
import { useAuth } from '../context/AuthContext';
import { useNotificaciones } from '../context/NotificacionesContext';
import {
  cancelarSolicitud,
  listarMisHogares,
  listarMisInvitacionesPendientes,
  listarMisSolicitudesPendientes,
  responderInvitacion,
  salirDeHogar,
} from '../services/hogares';
import type { HogarConRol, MiInvitacionPendiente, MiSolicitudPendiente } from '../services/hogares';
import { listarActividadReciente } from '../services/actividad';
import {
  elegirHogarInicial,
  guardarHogarSeleccionado,
  hogaresDeLasAlertas,
  leerAlertasDeTodos,
  leerHogarGuardado,
} from '../services/preferenciasHogar';
import type { ActividadItem } from '../services/actividad';
import {
  etiquetaStock,
  etiquetaVencimiento,
  estadoVencimiento,
  listarProductosConStockBajo,
  listarProductosProximosAVencer,
  nombreConMarca,
  textoVerTodos,
} from '../services/productos';
import type { AlertaStock } from '../services/productos';
import type { Hogar, Producto } from '../types/database';
import { supabase } from '../lib/supabase';
import { agruparLlamadas, nombreDeCanal } from '../lib/tiempoReal';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';

/**
 * Pantalla principal (dashboard) que ve cualquier usuario logueado al
 * entrar a la app: header con saludo + logo, contenido con accesos rápidos
 * a lo que ya existe (hogar, productos) y nav bar inferior fija.
 *
 * Todo el dashboard (el hogar que se muestra en "Tus hogares activos", su
 * actividad reciente y los accesos rápidos) gira alrededor de un único
 * `hogarSeleccionado`, elegido con "Cambiar hogar" -- distinto de
 * `usuarios.hogar_id` (el "hogar activo" real que usa el resto de la
 * app/RLS), que no se toca desde acá. "Actividad reciente" muestra datos
 * reales (ver src/services/actividad.ts y la migración
 * 20260907130000_actividad_hogar.sql), generados por triggers sobre
 * `productos` -- hoy es lo único con ABM real. "Productos próximos a
 * vencer" (RF2/RF3, ver src/services/productos.ts) va arriba de "Actividad
 * reciente" a propósito -- es la alerta más visible del dashboard. Como el
 * resto del dashboard, por defecto es solo del `hogarSeleccionado`; con la
 * opción "Alertas de todos mis hogares" (pantalla Notificaciones, ver
 * services/preferenciasHogar.ts) junta los de TODOS los hogares del
 * usuario. Muestra solo los primeros MAX_ALERTAS_DASHBOARD; la lista
 * completa está en el filtro "Por vencer" de ProductosScreen (botón "Ver
 * todos"). "Stock bajo" sigue el mismo criterio (mismo alcance, los
 * primeros MAX_ALERTAS_DASHBOARD y "Ver todos" al filtro "Stock bajo").
 *
 * El hogar elegido se recuerda en el dispositivo: al volver a abrir la app o
 * la página se sigue mostrando el mismo.
 */

// Cuántas alertas de cada tipo entran en el dashboard antes del "Ver todos":
// que se vean sin scroll y no tapen el resto de la pantalla.
const MAX_ALERTAS_DASHBOARD = 4;
export function HomeScreen() {
  const styles = useEstilos(crearEstilos);
  const { usuario, usuarioLoading, refreshUsuario } = useAuth();
  const { noLeidas, suscribirseANuevas } = useNotificaciones();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList, 'Home'>>();
  const route = useRoute<RouteProp<AppStackParamList, 'Home'>>();
  const abrirMiembrosDe = route.params?.abrirMiembrosDe;
  // "Ver tutorial" desde Cuenta o la Ayuda.
  const verTutorial = route.params?.verTutorial;
  const enFoco = useIsFocused();
  // Preferencia general "avisarme X días antes" (cada producto puede tener
  // la suya, ver estadoVencimiento): define qué entra en "Productos próximos
  // a vencer".
  const diasAviso = usuario?.dias_aviso_vencimiento;

  // Modales de "Crear Nuevo Hogar" y "Unirme a un Hogar" (mismo
  // HogarFormModal, distinto mode), disparados por los botones debajo de
  // "Tus hogares activos" -- un toque directo, sin gestos escondidos (antes
  // vivían atrás de un long-press sobre "Perfil" en la nav bar).
  const [crearVisible, setCrearVisible] = useState(false);
  // Formulario "Sugerir producto" del acceso rápido (ver CatalogoSelectorModal).
  const [sugerirVisible, setSugerirVisible] = useState(false);
  const [unirseVisible, setUnirseVisible] = useState(false);

  // Hogares de los que el usuario ya es miembro (puede ser más de uno).
  // Se muestran en "Tus hogares activos"; se recarga después de
  // crear/unirse/salir para que la sección quede siempre al día.
  const [misHogares, setMisHogares] = useState<HogarConRol[]>([]);
  const [hogaresLoading, setHogaresLoading] = useState(true);
  // Hogar que se está editando desde "Tus hogares activos" (null = cerrado).
  // Reusa el mismo HogarFormModal en modo "editar" que "Crear"/"Unirme".
  const [hogarEditando, setHogarEditando] = useState<HogarConRol | null>(null);
  // Hogar cuyo modal de "Miembros" está abierto (null = cerrado).
  const [hogarMiembrosVisible, setHogarMiembrosVisible] = useState<HogarConRol | null>(null);

  // Solicitudes que YO mandé (unirse por código) y todavía esperan que el
  // dueño del hogar destino las acepte o las rechace. Se muestran aparte de
  // "Tus hogares activos" (que solo tiene hogares donde ya soy miembro de
  // verdad) para que, si cierro y reabro la app antes de que respondan, no
  // se pierda que estoy esperando una respuesta.
  const [misSolicitudes, setMisSolicitudes] = useState<MiSolicitudPendiente[]>([]);

  // hogarIds de solicitudes que YO mismo acabo de cancelar (ver
  // handleCancelarSolicitud). El DELETE que dispara cancelarSolicitud()
  // también le llega a este mismo cliente por Realtime (está suscripto a
  // sus propios cambios, no solo a los de otros) -- y a diferencia de
  // "rechacé mi propia invitación" (que se distingue por origen='invitacion'
  // en el payload), "cancelé mi propia solicitud" y "el dueño la rechazó"
  // son EXACTAMENTE el mismo DELETE (mismo estado, mismo origen='solicitud'),
  // no hay ningún campo que los diferencie. Se guarda acá para que el
  // handler de Realtime sepa que este DELETE puntual no necesita ningún
  // aviso. Un ref (no state) porque no hace falta re-renderizar, solo que
  // el próximo evento lo pueda leer.
  const solicitudesCanceladasPorMi = useRef<Set<string>>(new Set());

  // Invitaciones que ME mandó el dueño de un hogar por mail (ver migración
  // 20260908120000_invitar_por_email.sql) y todavía no acepté ni rechacé.
  // Flujo inverso de misSolicitudes: acá el dueño inició el contacto.
  const [misInvitaciones, setMisInvitaciones] = useState<MiInvitacionPendiente[]>([]);
  const [respondiendoInvitacion, setRespondiendoInvitacion] = useState<string | null>(null);

  // Hogar que el resto del dashboard (alertas, Actividad reciente, Accesos
  // rápidos) toma como referencia. Es una selección de esta pantalla,
  // recordada en el dispositivo (services/preferenciasHogar.ts) -- no toca
  // `usuarios.hogar_id` (el "hogar activo" real que usa el resto de la app y
  // la RLS) -- así que cambiarla acá nunca afecta a qué hogar apunta crear
  // un hogar/aceptar una solicitud en otro lado.
  const [hogarSeleccionadoId, setHogarSeleccionadoId] = useState<string | null>(null);
  // Hogar recordado de la última vez. `undefined` mientras todavía se está
  // leyendo: hasta entonces no se elige ninguno, así no se ve un hogar y al
  // instante otro.
  const [hogarGuardado, setHogarGuardado] = useState<string | null | undefined>(undefined);
  // Opción "Alertas de todos mis hogares" (por defecto solo el que se usa).
  // `null` mientras se lee.
  const [alertasDeTodos, setAlertasDeTodos] = useState<boolean | null>(null);
  const [cambiarHogarVisible, setCambiarHogarVisible] = useState(false);
  const hogarSeleccionado = misHogares.find((h) => h.id === hogarSeleccionadoId) ?? null;

  // Actividad reciente del hogar seleccionado (ver migración
  // 20260907130000_actividad_hogar.sql). Se recarga cada vez que cambia la
  // selección y cada vez que esta pantalla vuelve a tener foco (por ejemplo,
  // al volver de cargar un producto en ProductosScreen).
  const [actividad, setActividad] = useState<ActividadItem[]>([]);
  const [actividadLoading, setActividadLoading] = useState(false);

  // RF2/RF3: productos de TODOS mis hogares que están próximos a vencer o
  // ya vencidos (con la alerta habilitada), para "Productos próximos a
  // vencer". Se muestra arriba de "Actividad reciente" a propósito -- es
  // la alerta más importante del dashboard, tiene que verse sin scroll.
  const [productosPorVencer, setProductosPorVencer] = useState<Producto[]>([]);
  const [productosPorVencerLoading, setProductosPorVencerLoading] = useState(true);

  // Alerta de stock mínimo: productos de TODOS mis hogares por debajo de su
  // mínimo (mismo criterio que "Productos próximos a vencer").
  const [alertasStock, setAlertasStock] = useState<AlertaStock[]>([]);
  const [alertasStockLoading, setAlertasStockLoading] = useState(true);

  // Tutorial guiado (src/tutorial/): la primera vez pregunta si lo quiere;
  // se pausa mientras se prueba algo (otra pantalla o un formulario abierto)
  // y sigue al volver.
  const ocupado =
    !enFoco ||
    crearVisible ||
    unirseVisible ||
    sugerirVisible ||
    cambiarHogarVisible ||
    hogarEditando !== null ||
    hogarMiembrosVisible !== null;
  const tutorial = useTutorialInicio({
    usuarioId: usuario?.id,
    tieneHogar: misHogares.length > 0,
    ocupado,
    onAccion: (accion: AccionTutorial) => {
      if (accion === 'crearHogar') {
        setCrearVisible(true);
        return true;
      }
      if (!hogarSeleccionado) {
        avisar('Todavía no tenés un hogar', 'Creá o unite a un hogar primero para poder cargar productos.');
        return false;
      }
      if (accion === 'agregarProducto') handleIrAProductos({ abrirAgregar: true });
      else if (accion === 'escanearTicket') handleIrAProductos({ abrirTicket: true });
      else handleIrAProductos({ abrirVoz: true });
      return true;
    },
  });
  const iniciarTutorial = tutorial.iniciar;
  useEffect(() => {
    if (!verTutorial) return;
    iniciarTutorial();
    navigation.setParams({ verTutorial: undefined });
  }, [verTutorial, iniciarTutorial, navigation]);

  const cargarMisHogares = useCallback(async () => {
    setHogaresLoading(true);
    try {
      setMisHogares(await listarMisHogares());
    } catch (err) {
      console.warn('[Stocky] No se pudieron cargar los hogares del usuario:', err);
    } finally {
      setHogaresLoading(false);
    }
  }, []);

  const cargarMisSolicitudes = useCallback(async () => {
    try {
      setMisSolicitudes(await listarMisSolicitudesPendientes());
    } catch (err) {
      console.warn('[Stocky] No se pudieron cargar las solicitudes pendientes:', err);
    }
  }, []);

  const cargarMisInvitaciones = useCallback(async () => {
    try {
      setMisInvitaciones(await listarMisInvitacionesPendientes());
    } catch (err) {
      console.warn('[Stocky] No se pudieron cargar las invitaciones pendientes:', err);
    }
  }, []);

  useEffect(() => {
    cargarMisHogares();
    cargarMisSolicitudes();
    cargarMisInvitaciones();
  }, [cargarMisHogares, cargarMisSolicitudes, cargarMisInvitaciones]);

  // Lee el hogar recordado de la última vez (una vez por cuenta).
  const usuarioId = usuario?.id;
  useEffect(() => {
    if (!usuarioId) return;
    let vigente = true;
    leerHogarGuardado(usuarioId).then((id) => {
      if (vigente) setHogarGuardado(id);
    });
    return () => {
      vigente = false;
    };
  }, [usuarioId]);

  // Si la selección actual ya no es válida (todavía no se eligió ninguna,
  // o el hogar seleccionado se dejó/expulsó/etc.), se elige con
  // elegirHogarInicial: el recordado de la última vez, si no el "hogar
  // activo" de siempre (usuario.hogar_id), si no el primero de la lista. Si
  // ya hay una selección válida, se respeta -- no se le pisa la elección al
  // usuario cada vez que se recarga la lista por otro motivo (crear/salir de
  // OTRO hogar, etc.).
  useEffect(() => {
    if (hogarGuardado === undefined) return; // todavía leyendo
    if (misHogares.length === 0) {
      if (hogarSeleccionadoId !== null) setHogarSeleccionadoId(null);
      return;
    }

    const sigueSiendoValida = misHogares.some((h) => h.id === hogarSeleccionadoId);
    if (sigueSiendoValida) return;

    setHogarSeleccionadoId(elegirHogarInicial(misHogares.map((h) => h.id), hogarGuardado, usuario?.hogar_id));
  }, [misHogares, hogarSeleccionadoId, hogarGuardado, usuario?.hogar_id]);

  // Recuerda el hogar que se está mostrando para la próxima vez que se abra
  // la app o la página.
  useEffect(() => {
    if (usuarioId && hogarSeleccionadoId) guardarHogarSeleccionado(usuarioId, hogarSeleccionadoId);
  }, [usuarioId, hogarSeleccionadoId]);

  // La opción de alcance se cambia en Notificaciones: se vuelve a leer cada
  // vez que se vuelve a esta pantalla.
  useFocusEffect(
    useCallback(() => {
      if (!usuarioId) return;
      leerAlertasDeTodos(usuarioId).then(setAlertasDeTodos);
    }, [usuarioId]),
  );

  // Llegando desde la notificación "X quiere unirse a ...": selecciona ese
  // hogar y abre "Miembros del hogar" para aceptar o rechazar, apenas la
  // lista de hogares está cargada. Después se limpia el parámetro para que
  // no se vuelva a abrir solo.
  useEffect(() => {
    if (!abrirMiembrosDe || misHogares.length === 0) return;
    const hogar = misHogares.find((h) => h.id === abrirMiembrosDe);
    if (hogar) {
      setHogarSeleccionadoId(hogar.id);
      setHogarMiembrosVisible(hogar);
    }
    navigation.setParams({ abrirMiembrosDe: undefined });
  }, [abrirMiembrosDe, misHogares, navigation]);

  // `silencioso`: sin spinner (cuando la recarga la pide un cambio de otra
  // persona por Realtime, para no hacer parpadear la tarjeta).
  const cargarActividad = useCallback(async (hogarId: string, silencioso = false) => {
    if (!silencioso) setActividadLoading(true);
    try {
      setActividad(await listarActividadReciente(hogarId, 5));
    } catch (err) {
      console.warn('[Stocky] No se pudo cargar la actividad reciente:', err);
    } finally {
      if (!silencioso) setActividadLoading(false);
    }
  }, []);

  // Se recarga al montar, cada vez que cambia el hogar seleccionado, y cada
  // vez que esta pantalla vuelve a tener foco (por ejemplo, al volver de
  // cargar un producto en ProductosScreen) -- useFocusEffect cubre los tres
  // casos: corre al enfocar y de nuevo si cambia el callback (que depende
  // del id seleccionado) mientras sigue enfocada.
  useFocusEffect(
    useCallback(() => {
      if (hogarSeleccionado) {
        cargarActividad(hogarSeleccionado.id);
      } else {
        setActividad([]);
      }
    }, [hogarSeleccionado?.id, cargarActividad]),
  );

  // Alertas del dashboard (por vencer + stock bajo) del hogar que se está
  // usando, o de TODOS mis hogares si se eligió esa opción
  // (hogaresDeLasAlertas), pasándole los IDs explícitos en vez de dejar que
  // la RLS filtre sola (mismo motivo que el resto de las queries "mis X" de
  // este archivo/servicio -- ver docs/incidentes-sprint2.md #2). Se recargan
  // al cambiar la lista de hogares, el hogar elegido, la opción de alcance o
  // la preferencia de días, al volver a esta pantalla (por ejemplo, después
  // de cargar productos) y cuando llega una notificación de stock o
  // vencimiento.
  const cargarAlertas = useCallback(async () => {
    // Sin la opción leída, o sin hogar elegido todavía (si hay hogares),
    // se sigue mostrando el "cargando" en vez de una lista vacía engañosa.
    if (alertasDeTodos === null) return;
    if (!alertasDeTodos && misHogares.length > 0 && !hogarSeleccionadoId) return;
    const hogarIds = hogaresDeLasAlertas(
      misHogares.map((h) => h.id),
      hogarSeleccionadoId,
      alertasDeTodos,
    );
    const [alertas, porVencer] = await Promise.allSettled([
      listarProductosConStockBajo(hogarIds),
      listarProductosProximosAVencer(hogarIds, diasAviso),
    ]);
    if (alertas.status === 'fulfilled') setAlertasStock(alertas.value);
    else console.warn('[Stocky] No se pudieron cargar las alertas de stock:', alertas.reason);
    if (porVencer.status === 'fulfilled') setProductosPorVencer(porVencer.value);
    else console.warn('[Stocky] No se pudieron cargar los productos próximos a vencer:', porVencer.reason);
    setAlertasStockLoading(false);
    setProductosPorVencerLoading(false);
  }, [misHogares, hogarSeleccionadoId, alertasDeTodos, diasAviso]);

  useFocusEffect(
    useCallback(() => {
      cargarAlertas();
    }, [cargarAlertas]),
  );

  useEffect(
    () =>
      suscribirseANuevas((n) => {
        if (['por_vencer', 'vencido', 'stock_bajo', 'sin_stock'].includes(n.tipo)) cargarAlertas();
      }),
    [suscribirseANuevas, cargarAlertas],
  );

  // Tiempo real: cada cambio de productos en mis hogares (de cualquier
  // miembro) genera una fila en actividad_hogar (trigger). Al llegar, se
  // actualizan solas la "Actividad reciente" y las alertas, sin salir y
  // volver a entrar. Los avisos seguidos se agrupan en una sola recarga.
  // Necesita actividad_hogar en Realtime (migración
  // 20261016120000_realtime_productos_y_actividad.sql).
  const idsDeMisHogares = misHogares.map((h) => h.id).join(',');
  const idSeleccionado = hogarSeleccionado?.id;
  useEffect(() => {
    if (!idsDeMisHogares) return;
    const recarga = agruparLlamadas(() => {
      cargarAlertas();
      if (idSeleccionado) cargarActividad(idSeleccionado, true);
    });
    const canal = supabase
      .channel(nombreDeCanal(`actividad-${idsDeMisHogares}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'actividad_hogar', filter: `hogar_id=in.(${idsDeMisHogares})` },
        () => recarga.disparar(),
      )
      .subscribe();
    return () => {
      recarga.cancelar();
      supabase.removeChannel(canal);
    };
  }, [idsDeMisHogares, idSeleccionado, cargarAlertas, cargarActividad]);

  // Me entero al instante de tres cosas que puede hacer el DUEÑO de un
  // hogar sobre MI propia fila de hogar_miembros, sin que yo tenga que
  // recargar a mano (quien las dispara ya ve el cambio porque es su propia
  // acción -- esto cubre al otro lado, a mí):
  //   - Acepta mi solicitud (UPDATE: estado pasa de 'pendiente' a 'aprobado').
  //   - Rechaza mi solicitud (DELETE con estado ANTERIOR 'pendiente').
  //   - Me expulsa de un hogar del que ya era miembro (DELETE con estado
  //     ANTERIOR 'aprobado').
  // Necesita REPLICA IDENTITY FULL en hogar_miembros (ver migración
  // 20260903120000_solicitudes_hogar.sql) para que el "old record" del
  // payload traiga el estado previo y no solo la primary key.
  // Desde las notificaciones (Sprint 10) esto SOLO recarga los datos: el
  // cartelito ("¡Te aceptaron!", "Te sacaron de un hogar"...) lo muestra
  // NotificacionesContext al llegar la notificación que genera la base, con
  // el nombre del hogar. Si se avisara también acá, saldrían dos cartelitos.
  useEffect(() => {
    if (!usuario?.id) return;

    const canal = supabase
      .channel(nombreDeCanal(`hogar_miembros_usuario_${usuario.id}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        (payload) => {
          // Solo interesa acá el caso "el dueño de un hogar me invitó por
          // mail" (ver migración 20260908120000_invitar_por_email.sql):
          // "me sumo yo por código" no dispara un INSERT con mi propio
          // usuario_id desde OTRO cliente, así que no hay caso propio que
          // filtrar acá (a diferencia de UPDATE/DELETE, más abajo).
          const nueva = payload.new as { origen?: string; estado?: string } | null;
          if (nueva?.origen === 'invitacion' && nueva?.estado === 'pendiente') {
            cargarMisInvitaciones();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        (payload) => {
          const anterior = payload.old as { estado?: string; origen?: string } | null;
          const actual = payload.new as { estado?: string } | null;
          if (anterior?.estado !== 'pendiente' || actual?.estado !== 'aprobado') return;

          // Si el origen era 'invitacion', quien acepta es uno mismo
          // (responderInvitacion, no el dueño) -- ese mismo cliente ya
          // actualizó su UI al hacerlo, así que acá solo hace falta
          // refrescar en silencio, sin un aviso redundante.
          if (anterior.origen === 'invitacion') {
            cargarMisHogares();
            cargarMisInvitaciones();
            refreshUsuario();
            return;
          }

          cargarMisHogares();
          cargarMisSolicitudes();
          refreshUsuario();
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        (payload) => {
          const anterior = payload.old as { hogar_id?: string; estado?: string; origen?: string } | null;

          // Si cancelé yo mismo esta solicitud (ver handleCancelarSolicitud
          // y el comentario de solicitudesCanceladasPorMi más arriba), no
          // corresponde ningún aviso -- ya lo reflejé en la UI al tocar el
          // botón. `Set#delete` devuelve true si estaba y lo saca, así que
          // esto también limpia la marca para no dejarla pisada.
          if (anterior?.hogar_id && solicitudesCanceladasPorMi.current.delete(anterior.hogar_id)) {
            return;
          }

          // Mismo caso que en UPDATE: si era una invitación pendiente, quien
          // la borra al rechazarla es uno mismo -- sin aviso redundante.
          if (anterior?.estado === 'pendiente' && anterior.origen === 'invitacion') {
            cargarMisInvitaciones();
            return;
          }

          cargarMisHogares();
          cargarMisSolicitudes();
          refreshUsuario();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id, cargarMisHogares, cargarMisSolicitudes, cargarMisInvitaciones, refreshUsuario]);

  // Lado DUEÑO: que el punto rojo de "hay solicitudes pendientes" (ver
  // hogar.solicitudesPendientes) aparezca apenas alguien pide unirse, y
  // desaparezca apenas se acepta/rechaza (desde este mismo dispositivo o
  // desde HogarMiembrosModal), sin depender de refrescar la pantalla a mano.
  // Sin filtro de columna a propósito: Realtime ya aplica la misma policy de
  // SELECT que el resto de la app (usuario_id=auth.uid() OR
  // es_miembro_de(hogar_id) OR admin), así que acá solo llegan eventos de
  // hogares donde YO soy miembro -- no hace falta (ni se puede fácil) armar
  // un filtro con la lista completa de mis hogares.
  useEffect(() => {
    if (!usuario?.id) return;

    const canal = supabase
      .channel(nombreDeCanal(`hogar_miembros_solicitudes_${usuario.id}`))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'hogar_miembros' },
        () => {
          cargarMisHogares();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id, cargarMisHogares]);

  function handleCrearHogar() {
    setCrearVisible(true);
  }

  // Salir es destructivo, no se dispara sin confirmar antes.
  // Usa confirmar()/avisar() (src/lib/alert.ts) en vez de Alert.alert
  // directo: en react-native-web, Alert.alert con botones es un no-op (no
  // muestra nada ni dispara el onPress), así que el botón de salir no hacía
  // nada en la versión web (ver docs/incidentes-sprint3.md).
  async function handleSalirDeHogar(hogar: HogarConRol) {
    const confirmado = await confirmar('Salir del hogar', `¿Seguro que querés salir de "${hogar.nombre}"?`, 'Salir');
    if (!confirmado) return;

    try {
      await salirDeHogar(hogar.id);
      await Promise.all([cargarMisHogares(), refreshUsuario()]);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo salir del hogar.');
    }
  }

  function handleUnirseAHogar() {
    setUnirseVisible(true);
  }

  // Acepta o rechaza una invitación que me mandaron por mail. No pide
  // confirmación al rechazar por el mismo motivo que "Rechazar solicitud"
  // en HogarMiembrosModal: no es tan destructivo como salir de un hogar del
  // que ya soy miembro.
  async function handleResponderInvitacion(invitacion: MiInvitacionPendiente, aprobar: boolean) {
    setRespondiendoInvitacion(invitacion.hogarId);
    try {
      await responderInvitacion(invitacion.hogarId, aprobar);
      await cargarMisInvitaciones();
      if (aprobar) await Promise.all([cargarMisHogares(), refreshUsuario()]);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo responder la invitación.');
    } finally {
      setRespondiendoInvitacion(null);
    }
  }

  // Accesos rápidos "Agregar producto" / "Ver despensa": van directo al
  // hogar elegido en "Cambiar hogar", sin preguntar nada -- si hay más de
  // uno (RF6), para eso está el selector. "Agregar producto" además le pide
  // a ProductosScreen que abra el modal de carga apenas llega, para no
  // obligar a un segundo toque sobre el FAB.
  // Recibe un objeto con nombres (y no varios true/false sueltos) para que
  // cada llamada se lea sola: handleIrAProductos({ abrirTicket: true }).
  function handleIrAProductos(
    opciones: { abrirAgregar?: boolean; abrirVoz?: boolean; abrirTicket?: boolean; enfocarBusqueda?: boolean } = {},
  ) {
    if (!hogarSeleccionado) {
      avisar('Todavía no tenés un hogar', 'Creá o unite a un hogar primero para poder cargar productos.');
      return;
    }
    navigation.navigate('Productos', {
      hogarId: hogarSeleccionado.id,
      hogarNombre: hogarSeleccionado.nombre,
      ...opciones,
    });
  }

  // Después de crear un hogar: refresca tanto la lista de hogares de esta
  // pantalla como `usuario` del AuthContext (por si `hogar_id` pasó de null
  // a un valor, que es lo que usa el resto de la app como "hogar activo").
  async function handleHogarCreado() {
    setCrearVisible(false);
    await Promise.all([cargarMisHogares(), refreshUsuario()]);
  }

  // A diferencia de crear un hogar, unirse por código ya NO suma como
  // miembro directo (ver migración 20260903120000_solicitudes_hogar.sql):
  // queda como solicitud pendiente hasta que el dueño la acepte o la
  // rechace, así que acá solo se avisa que se mandó, sin tocar
  // misHogares/usuario todavía (no cambiaron).
  async function handleSolicitudEnviada(hogar: Hogar) {
    setUnirseVisible(false);
    avisar('Solicitud enviada', `Le pedimos al dueño de "${hogar.nombre}" que apruebe tu ingreso. Te avisamos apenas responda.`);
    await cargarMisSolicitudes();
  }

  // Si el dueño tarda (o no responde nunca), quien mandó la solicitud puede
  // arrepentirse y cancelarla en vez de quedar esperando indefinidamente.
  async function handleCancelarSolicitud(solicitud: MiSolicitudPendiente) {
    const confirmado = await confirmar(
      'Cancelar solicitud',
      `¿Cancelar tu solicitud para unirte a "${solicitud.nombreHogar}"?`,
      'Cancelar solicitud',
    );
    if (!confirmado) return;

    // Marcado ANTES de llamar a cancelarSolicitud: el DELETE puede llegar
    // por Realtime en cualquier momento después de que la RLS lo confirme,
    // así que tiene que estar disponible desde antes de que exista la
    // menor chance de que el evento llegue (ver handler de DELETE más abajo).
    solicitudesCanceladasPorMi.current.add(solicitud.hogarId);
    try {
      await cancelarSolicitud(solicitud.hogarId);
      await cargarMisSolicitudes();
    } catch (err) {
      solicitudesCanceladasPorMi.current.delete(solicitud.hogarId);
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cancelar la solicitud.');
    }
  }

  // Toques cortos sobre tabs que todavía no tienen pantalla propia
  // (Búsqueda, Notificaciones y Perfil). "Home" no hace nada porque ya
  // estamos ahí.
  function handleTabPress(tab: TabKey) {
    // La lupa lleva al buscador de la despensa del hogar seleccionado.
    if (tab === 'search') {
      handleIrAProductos({ enfocarBusqueda: true });
      return;
    }
    // La campanita abre las notificaciones recientes.
    if (tab === 'notifications') {
      navigation.navigate('Notificaciones');
      return;
    }
    // La persona abre Cuenta (perfil, cuentas, modo oscuro, ajustes, cerrar sesión).
    if (tab === 'profile') {
      navigation.navigate('Cuenta');
    }
    // El escudo (solo admins) abre el panel de administración.
    if (tab === 'admin') {
      navigation.navigate('Admin');
    }
  }

  // Toca un producto de "Productos próximos a vencer": va directo a la
  // pantalla de Productos del hogar al que pertenece (mismo patrón que el
  // ícono de canasta de "Tus hogares activos").
  function handleVerProductoPorVencer(producto: Producto) {
    handleVerAlertas(producto.hogar_id, 'porVencer');
  }

  // "Ver todos" de las tarjetas de alertas (y tocar una alerta): abre la
  // despensa de ese hogar con el filtro correspondiente ya aplicado, donde
  // está la lista completa ordenada (ver filtroAlerta en ProductosScreen).
  function handleVerAlertas(hogarId: string, filtroInicial: FiltroAlerta) {
    const hogar = misHogares.find((h) => h.id === hogarId);
    if (!hogar) return;
    navigation.navigate('Productos', { hogarId: hogar.id, hogarNombre: hogar.nombre, filtroInicial });
  }

  // Las alertas mezclan hogares solo con la opción "todos" y más de un
  // hogar: recién ahí hace falta decir de qué hogar es cada una.
  const alertasDeVariosHogares = alertasDeTodos === true && misHogares.length > 1;

  // El "Ver todos" lleva al hogar del primer ítem de la lista (el más
  // urgente): la despensa es por hogar, así que con varios hogares el botón
  // lo nombra ("Ver todos en <hogar>").
  function nombreHogar(hogarId: string): string {
    return misHogares.find((h) => h.id === hogarId)?.nombre ?? '';
  }

  return (
    <ScreenContainer style={styles.container} noPadding>
      <View style={styles.padded}>
        <Header
          nombre={usuario?.nombre}
          email={usuario?.email}
          avatarUrl={usuario?.avatar_url}
          onPerfil={() => navigation.navigate('Cuenta')}
          onAyuda={() => navigation.navigate('Ayuda')}
          refAyuda={tutorial.objetivo('ayuda')}
        />
      </View>

      {/* Contenido scrolleable entre el header y la nav bar fija. La View de
          afuera solo marca la zona visible, para que el tutorial sepa si
          tiene que scrollear hasta lo que explica. */}
      <View ref={tutorial.zonaScrollRef} collapsable={false} style={styles.zonaScroll}>
      <ScrollView
        ref={tutorial.scrollRef}
        onScroll={tutorial.onScroll}
        scrollEventThrottle={32}
        style={styles.padded}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {usuarioLoading && !usuario ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : usuario ? (
          <>
            <SectionCard title="Tus hogares activos">
              {hogaresLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : misHogares.length === 0 ? (
                <EmptyState icon="home-outline" text="Todavía no formás parte de ningún hogar." />
              ) : (
                hogarSeleccionado && (
                  <View ref={tutorial.objetivo('hogar')} collapsable={false} style={styles.hogaresList}>
                    {/* Solo se muestra el hogar elegido en "Cambiar hogar"
                        (no toda la lista) -- el resto del dashboard
                        (Actividad reciente, Accesos rápidos) también se
                        refiere a este mismo. El botón de cambiar solo tiene
                        sentido si hay más de uno entre qué elegir. */}
                    {misHogares.length > 1 && (
                      <Pressable
                        style={styles.cambiarHogarButton}
                        onPress={() => setCambiarHogarVisible(true)}
                        accessibilityRole="button"
                        accessibilityLabel={`Cambiar hogar, mostrando ${hogarSeleccionado.nombre}`}
                      >
                        <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
                        <Text style={styles.cambiarHogarTexto}>Cambiar hogar</Text>
                      </Pressable>
                    )}

                    <View style={styles.hogarRow}>
                      <View style={styles.hogarInfo}>
                        <NombreDeHogar nombre={hogarSeleccionado.nombre} style={styles.hogarNombre} />
                        <Text style={styles.hogarCodigo}>
                          Código: {hogarSeleccionado.codigo_invitacion} · {hogarSeleccionado.miRol === 'dueno' ? 'Dueño' : 'Invitado'}
                        </Text>
                      </View>
                      <View style={styles.hogarAcciones}>
                        <Pressable
                          onPress={() =>
                            navigation.navigate('Productos', { hogarId: hogarSeleccionado.id, hogarNombre: hogarSeleccionado.nombre })
                          }
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Productos de ${hogarSeleccionado.nombre}`}
                        >
                          <Ionicons name="basket-outline" size={18} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => setHogarMiembrosVisible(hogarSeleccionado)}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={
                            hogarSeleccionado.solicitudesPendientes > 0
                              ? `Miembros de ${hogarSeleccionado.nombre}, ${hogarSeleccionado.solicitudesPendientes} solicitud${hogarSeleccionado.solicitudesPendientes === 1 ? '' : 'es'} pendiente${hogarSeleccionado.solicitudesPendientes === 1 ? '' : 's'}`
                              : `Miembros de ${hogarSeleccionado.nombre}`
                          }
                        >
                          <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
                          {hogarSeleccionado.solicitudesPendientes > 0 && <View style={styles.solicitudDot} />}
                        </Pressable>
                        {/* Editar el nombre está restringido al dueño por
                            default; un invitado solo lo ve si el dueño le
                            habilitó el permiso (ver "Miembros del hogar"). */}
                        {hogarSeleccionado.puedoEditar && (
                          <Pressable
                            onPress={() => setHogarEditando(hogarSeleccionado)}
                            style={styles.hogarAccionButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Editar ${hogarSeleccionado.nombre}`}
                          >
                            <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => handleSalirDeHogar(hogarSeleccionado)}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Salir de ${hogarSeleccionado.nombre}`}
                        >
                          <Ionicons name="exit-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )
              )}

              {/* Un toque directo, sin gestos escondidos -- antes vivían
                  atrás de un long-press sobre "Perfil" en la nav bar. */}
              <View ref={tutorial.objetivo('crearHogar')} collapsable={false} style={styles.hogaresAccionesRow}>
                <Button
                  label="Crear hogar"
                  variant="outline"
                  onPress={handleCrearHogar}
                  style={styles.hogaresAccionButton}
                />
                <Button
                  label="Unirme a un hogar"
                  variant="outline"
                  onPress={handleUnirseAHogar}
                  style={styles.hogaresAccionButton}
                />
              </View>
            </SectionCard>

            {/* Solo aparece si mandé alguna solicitud que el dueño todavía
                no resolvió -- no confundir con "Tus hogares activos" (esos
                ya son membresías aceptadas). */}
            {misSolicitudes.length > 0 && (
              <SectionCard title="Solicitudes que enviaste">
                <View style={styles.hogaresList}>
                  {misSolicitudes.map((solicitud) => (
                    <View key={solicitud.hogarId} style={styles.hogarRow}>
                      <View style={styles.hogarInfo}>
                        <NombreDeHogar nombre={solicitud.nombreHogar} style={styles.hogarNombre} />
                        <Text style={styles.hogarCodigo}>Esperando respuesta del dueño</Text>
                      </View>
                      <Pressable
                        onPress={() => handleCancelarSolicitud(solicitud)}
                        style={styles.hogarAccionButton}
                        accessibilityRole="button"
                        accessibilityLabel={`Cancelar solicitud a ${solicitud.nombreHogar}`}
                      >
                        <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              </SectionCard>
            )}

            {/* Invitaciones que un dueño me mandó por mail (ver migración
                20260908120000_invitar_por_email.sql) -- flujo inverso de
                "Solicitudes que enviaste": acá el dueño inició el contacto
                y soy yo quien decide. */}
            {misInvitaciones.length > 0 && (
              <SectionCard title="Invitaciones recibidas">
                <View style={styles.hogaresList}>
                  {misInvitaciones.map((invitacion) => (
                    <View key={invitacion.hogarId} style={styles.hogarRow}>
                      <NombreDeHogar nombre={invitacion.nombreHogar} style={styles.hogarNombre} />
                      <View style={styles.invitacionAcciones}>
                        <Pressable
                          onPress={() => handleResponderInvitacion(invitacion, true)}
                          style={styles.hogarAccionButton}
                          disabled={respondiendoInvitacion === invitacion.hogarId}
                          accessibilityRole="button"
                          accessibilityLabel={`Aceptar invitación a ${invitacion.nombreHogar}`}
                        >
                          <Ionicons name="checkmark-circle-outline" size={22} color={colors.primary} />
                        </Pressable>
                        <Pressable
                          onPress={() => handleResponderInvitacion(invitacion, false)}
                          style={styles.hogarAccionButton}
                          disabled={respondiendoInvitacion === invitacion.hogarId}
                          accessibilityRole="button"
                          accessibilityLabel={`Rechazar invitación a ${invitacion.nombreHogar}`}
                        >
                          <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </SectionCard>
            )}

            {/* RF2/RF3: la alerta más importante del dashboard, por eso va
                arriba de "Actividad reciente" -- tiene que verse apenas se
                entra, sin que el usuario tenga que buscarla. */}
            <View ref={tutorial.objetivo('porVencer')} collapsable={false}>
            <SectionCard title="Productos próximos a vencer">
              {productosPorVencerLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : productosPorVencer.length === 0 ? (
                <EmptyState
                  icon="checkmark-circle-outline"
                  text={
                    !alertasDeVariosHogares && hogarSeleccionado && misHogares.length > 1
                      ? `No hay productos por vencer en "${hogarSeleccionado.nombre}" en los próximos días.`
                      : 'No tenés productos por vencer en los próximos días.'
                  }
                />
              ) : (
                <View style={styles.hogaresList}>
                  {productosPorVencer.slice(0, MAX_ALERTAS_DASHBOARD).map((producto) => {
                    const hogar = misHogares.find((h) => h.id === producto.hogar_id);
                    const estado = estadoVencimiento(producto, undefined, diasAviso);
                    const etiqueta = etiquetaVencimiento(producto, undefined, diasAviso);
                    return (
                      <Pressable key={producto.id} style={styles.hogarRow} onPress={() => handleVerProductoPorVencer(producto)}>
                        <View style={styles.hogarInfo}>
                          <Text style={styles.hogarNombre} numberOfLines={1}>
                            {nombreConMarca(producto)}
                          </Text>
                          {alertasDeVariosHogares && (
                            <Text style={styles.hogarCodigo} numberOfLines={1}>
                              {hogar?.nombre ?? ''}
                            </Text>
                          )}
                        </View>
                        {etiqueta && estado && <BadgeVencimiento estado={estado} etiqueta={etiqueta} />}
                      </Pressable>
                    );
                  })}
                  <VerTodosButton
                    total={productosPorVencer.length}
                    hogarNombre={alertasDeVariosHogares ? nombreHogar(productosPorVencer[0].hogar_id) : null}
                    onPress={() => handleVerAlertas(productosPorVencer[0].hogar_id, 'porVencer')}
                  />
                </View>
              )}
            </SectionCard>
            </View>

            {/* Alerta de stock mínimo: ámbar (stockStatus.low), distinta del
                coral de vencimientos, para que no se confundan. */}
            <View ref={tutorial.objetivo('stockBajo')} collapsable={false}>
            <SectionCard title="Stock bajo">
              {alertasStockLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : alertasStock.length === 0 ? (
                <EmptyState
                  icon="checkmark-circle-outline"
                  text={
                    !alertasDeVariosHogares && hogarSeleccionado && misHogares.length > 1
                      ? `En "${hogarSeleccionado.nombre}" ningún producto está por debajo de su stock mínimo.`
                      : 'Ningún producto está por debajo de su stock mínimo.'
                  }
                />
              ) : (
                <View style={styles.hogaresList}>
                  {alertasStock.slice(0, MAX_ALERTAS_DASHBOARD).map((alerta) => (
                    <Pressable key={alerta.clave} style={styles.hogarRow} onPress={() => handleVerAlertas(alerta.hogarId, 'stockBajo')}>
                      <View style={styles.hogarInfo}>
                        <Text style={styles.hogarNombre} numberOfLines={1}>
                          {alerta.nombre}
                        </Text>
                        <Text style={styles.hogarCodigo} numberOfLines={1}>
                          Quedan {alerta.cantidadTotal} {alerta.unidad}
                          {alertasDeVariosHogares ? ` · ${nombreHogar(alerta.hogarId)}` : ''}
                        </Text>
                      </View>
                      <View style={styles.stockBadge}>
                        <Ionicons name="alert-circle" size={12} color={colors.textPrimary} />
                        <Text style={styles.stockBadgeTexto}>{etiquetaStock(alerta.estado, alerta.stockMinimo)}</Text>
                      </View>
                    </Pressable>
                  ))}
                  <VerTodosButton
                    total={alertasStock.length}
                    hogarNombre={alertasDeVariosHogares ? nombreHogar(alertasStock[0].hogarId) : null}
                    onPress={() => handleVerAlertas(alertasStock[0].hogarId, 'stockBajo')}
                  />
                </View>
              )}
            </SectionCard>
            </View>

            <SectionCard title="Actividad reciente">
              {actividadLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : actividad.length === 0 ? (
                <EmptyState
                  icon="time-outline"
                  text={
                    hogarSeleccionado
                      ? `Todavía no hay movimientos para mostrar en "${hogarSeleccionado.nombre}".`
                      : 'Todavía no hay movimientos para mostrar.'
                  }
                />
              ) : (
                <View style={styles.hogaresList}>
                  {actividad.map((item) => {
                    const visual = actividadVisual(item);
                    return (
                      <View key={item.id} style={styles.actividadRow}>
                        {visual ? (
                          <View style={styles.actividadPrincipal}>
                            <Ionicons
                              name={visual.signo === '+' ? 'arrow-up-circle' : 'arrow-down-circle'}
                              size={16}
                              color={visual.color}
                            />
                            <Text style={[styles.actividadDescripcion, { color: visual.color }]}>{visual.texto}</Text>
                          </View>
                        ) : (
                          <Text style={styles.actividadDescripcion}>{item.descripcion}</Text>
                        )}
                        <Text style={styles.actividadMeta}>
                          {item.usuarioNombre ?? item.usuarioEmail ?? 'Alguien'} · {formatearFechaActividad(item.createdAt)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </SectionCard>

            <SectionCard title="Accesos rápidos">
              <View style={styles.quickAccessRow}>
                <QuickAccessButton
                  icon="add-circle-outline"
                  label="Agregar producto"
                  onPress={() => handleIrAProductos({ abrirAgregar: true })}
                  objetivoRef={tutorial.objetivo('agregarProducto')}
                />
                {/* Foto de un ticket -> productos detectados para revisar y guardar. */}
                <QuickAccessButton
                  icon="receipt-outline"
                  label="Escanear ticket"
                  onPress={() => handleIrAProductos({ abrirTicket: true })}
                  objetivoRef={tutorial.objetivo('escanearTicket')}
                />
                <QuickAccessButton
                  icon="mic-outline"
                  label="Cargar por voz"
                  onPress={() => handleIrAProductos({ abrirVoz: true })}
                  objetivoRef={tutorial.objetivo('cargarPorVoz')}
                />
                <QuickAccessButton icon="basket-outline" label="Ver despensa" onPress={() => handleIrAProductos()} />
                {/* Cualquier usuario puede sugerir un producto que falta en el
                    catálogo; queda pendiente hasta que un admin lo apruebe. */}
                <QuickAccessButton icon="bulb-outline" label="Sugerir producto" onPress={() => setSugerirVisible(true)} />
                {/* Sugerencias, usuarios, catálogo, comentarios y registro de
                    los admins están en el panel de administración (escudo de
                    la barra de abajo, solo para admins). */}
              </View>
            </SectionCard>
          </>
        ) : (
          // No se pudo cargar el perfil (error de red/RLS): mismo caso que
          // manejaba la versión anterior de esta pantalla.
          <View style={styles.center}>
            <Text style={styles.bodyText}>No se pudo cargar tu perfil. Revisá tu conexión e intentá de nuevo.</Text>
            <Button label="Reintentar" variant="outline" onPress={() => refreshUsuario()} />
          </View>
        )}

        {/* Cerrar sesión y los Términos y Condiciones viven ahora en Cuenta
            (botón de la persona en la barra de abajo). */}
      </ScrollView>
      </View>

      <BottomNavBar
        active="home"
        onTabPress={handleTabPress}
        notificacionesSinLeer={noLeidas}
        refsDeTabs={{ notifications: tutorial.objetivo('campanita'), profile: tutorial.objetivo('cuenta') }}
      />

      {tutorial.guiado && <TutorialGuiado {...tutorial.guiado} />}
      <BienvenidaTutorialModal
        visible={tutorial.preguntaVisible}
        nombre={usuario?.nombre}
        onQuiero={tutorial.responderQuiero}
        onYaSe={tutorial.responderYaSe}
      />

      <CatalogoSelectorModal visible={sugerirVisible} soloSugerir onClose={() => setSugerirVisible(false)} />

      <HogarFormModal
        visible={crearVisible}
        mode="crear"
        onClose={() => setCrearVisible(false)}
        onSuccess={handleHogarCreado}
      />

      <HogarFormModal
        visible={unirseVisible}
        mode="unirse"
        onClose={() => setUnirseVisible(false)}
        onSuccess={handleSolicitudEnviada}
      />

      <HogarFormModal
        visible={hogarEditando !== null}
        mode="editar"
        hogar={hogarEditando}
        onClose={() => setHogarEditando(null)}
        onSuccess={async () => {
          setHogarEditando(null);
          await Promise.all([cargarMisHogares(), refreshUsuario()]);
        }}
      />

      {usuario && (
        <HogarMiembrosModal
          visible={hogarMiembrosVisible !== null}
          hogarId={hogarMiembrosVisible?.id ?? null}
          hogarNombre={hogarMiembrosVisible?.nombre ?? ''}
          usuarioActualId={usuario.id}
          onClose={() => setHogarMiembrosVisible(null)}
        />
      )}

      <SeleccionarHogarModal
        visible={cambiarHogarVisible}
        onClose={() => setCambiarHogarVisible(false)}
        hogares={misHogares}
        hogarSeleccionadoId={hogarSeleccionadoId}
        onSeleccionar={setHogarSeleccionadoId}
      />
    </ScreenContainer>
  );
}

// Fecha corta para cada fila de "Actividad reciente": solo la hora si fue
// hoy (lo más común, no hace falta repetir la fecha), día/mes + hora si no.
function formatearFechaActividad(iso: string): string {
  const fecha = new Date(iso);
  const hoy = new Date();
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  if (fecha.toDateString() === hoy.toDateString()) return hora;

  const diaMes = fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  return `${diaMes} ${hora}`;
}

// Arma un badge tipo "Pera +3" (verde) / "Pera -3" (rojo) a partir del
// DELTA con signo que trae `cantidad` (ver migración
// 20260909020000_ajuste_rapido_y_delta_actividad.sql): +N al crear un
// producto o sumarle cantidad, -N al eliminarlo o restarle cantidad. Sin
// ramificar por `tipo` a propósito -- editar SIN tocar la cantidad llega
// acá con cantidad=0 y cae al mismo `return null` que cualquier actividad
// futura sin producto_nombre/cantidad, mostrando `descripcion` a secas.
function actividadVisual(item: ActividadItem): { texto: string; color: string; signo: '+' | '-' } | null {
  if (item.productoNombre === null || item.cantidad === null || item.cantidad === 0) return null;

  const positivo = item.cantidad > 0;
  return {
    texto: `${item.productoNombre} ${positivo ? '+' : ''}${item.cantidad}`,
    color: positivo ? colors.success : colors.danger,
    signo: positivo ? '+' : '-',
  };
}

interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}

// Estado vacío reusado por "hogares activos" y "actividad reciente": ícono
// + texto explicativo y, opcionalmente, un botón de acción.
// Pie de las tarjetas de alertas: lleva a la lista completa (filtro de
// ProductosScreen). Con un solo hogar no hace falta nombrarlo.
function VerTodosButton({ total, hogarNombre, onPress }: { total: number; hogarNombre: string | null; onPress: () => void }) {
  const styles = useEstilos(crearEstilos);
  const texto = textoVerTodos(total, hogarNombre, MAX_ALERTAS_DASHBOARD);
  return (
    <Pressable onPress={onPress} style={styles.verTodosButton} accessibilityRole="button">
      <Text style={styles.verTodosTexto}>{texto}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.primary} />
    </Pressable>
  );
}

function EmptyState({ icon, text, actionLabel, onAction }: EmptyStateProps) {
  const styles = useEstilos(crearEstilos);
  return (
    <View style={styles.emptyState}>
      <Ionicons name={icon} size={28} color={colors.textSecondary} />
      <Text style={styles.emptyStateText}>{text}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} variant="outline" onPress={onAction} style={styles.emptyStateButton} />
      )}
    </View>
  );
}

interface QuickAccessButtonProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  /** Para que el tutorial guiado pueda señalar este botón. */
  objetivoRef?: React.Ref<View>;
}

// Botón cuadrado de acceso rápido (ícono arriba, label abajo).
function QuickAccessButton({ icon, label, onPress, objetivoRef }: QuickAccessButtonProps) {
  const styles = useEstilos(crearEstilos);
  return (
    <Pressable ref={objetivoRef} collapsable={false} style={styles.quickAccessButton} onPress={onPress}>
      <Ionicons name={icon} size={26} color={colors.primary} />
      <Text style={styles.quickAccessLabel}>{label}</Text>
    </Pressable>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
  container: {
    paddingVertical: 0,
  },
  zonaScroll: {
    flex: 1,
  },
  padded: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loader: {
    marginTop: spacing.xl,
  },
  bodyText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  cambiarHogarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  cambiarHogarTexto: {
    ...typography.caption,
    color: colors.primary,
    flexShrink: 1,
  },
  hogaresList: {
    gap: spacing.xs,
  },
  hogarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  hogarInfo: {
    flexShrink: 1,
    gap: 2,
  },
  hogarNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  hogarCodigo: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  hogarAcciones: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  hogarAccionButton: {
    padding: spacing.xs,
    position: 'relative',
  },
  invitacionAcciones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  hogaresAccionesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  hogaresAccionButton: {
    flexGrow: 1,
    minWidth: 140,
  },
  actividadRow: {
    paddingVertical: spacing.xs,
    gap: 2,
  },
  actividadPrincipal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  actividadDescripcion: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  actividadMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  // Alerta de stock mínimo: mismo estilo que el badge de ProductosScreen.
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.stockStatus.low,
    backgroundColor: colors.warningLight,
  },
  stockBadgeTexto: {
    ...typography.caption,
    color: colors.textPrimary,
    fontSize: 11,
  },
  verTodosButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 2,
    paddingVertical: spacing.xs,
  },
  verTodosTexto: {
    ...typography.caption,
    color: colors.primary,
  },
  solicitudDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emptyStateButton: {
    marginTop: spacing.xs,
    alignSelf: 'stretch',
  },
  quickAccessRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickAccessButton: {
    flexGrow: 1,
    minWidth: 120,
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: 12,
  },
  quickAccessLabel: {
    ...typography.bodyMedium,
    color: colors.primary,
    textAlign: 'center',
  },
});
