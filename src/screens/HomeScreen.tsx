import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AppStackParamList } from '../types/navigation';
import { ScreenContainer } from '../components/ScreenContainer';
import { Header } from '../components/Header';
import { SectionCard } from '../components/SectionCard';
import { BottomNavBar } from '../components/BottomNavBar';
import { HogarFormModal } from '../components/HogarFormModal';
import { HogarMiembrosModal } from '../components/HogarMiembrosModal';
import { SeleccionarHogarModal } from '../components/SeleccionarHogarModal';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../services/auth';
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
import type { ActividadItem } from '../services/actividad';
import { etiquetaVencimiento, estadoVencimiento, listarProductosProximosAVencer } from '../services/productos';
import type { Hogar, Producto } from '../types/database';
import { supabase } from '../lib/supabase';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';

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
 * reciente" a propósito -- es la alerta más visible del dashboard -- y a
 * diferencia del resto de las secciones no depende de `hogarSeleccionado`:
 * junta los productos de TODOS los hogares del usuario, porque algo por
 * vencer en un hogar que no es el seleccionado en ese momento no debería
 * quedar escondido.
 */
export function HomeScreen() {
  const { usuario, usuarioLoading, refreshUsuario } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList, 'Home'>>();

  // Modales de "Crear Nuevo Hogar" y "Unirme a un Hogar" (mismo
  // HogarFormModal, distinto mode), disparados por los botones debajo de
  // "Tus hogares activos" -- un toque directo, sin gestos escondidos (antes
  // vivían atrás de un long-press sobre "Perfil" en la nav bar).
  const [crearVisible, setCrearVisible] = useState(false);
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

  // Invitaciones que ME mandó el dueño de un hogar por mail (ver migración
  // 20260908120000_invitar_por_email.sql) y todavía no acepté ni rechacé.
  // Flujo inverso de misSolicitudes: acá el dueño inició el contacto.
  const [misInvitaciones, setMisInvitaciones] = useState<MiInvitacionPendiente[]>([]);
  const [respondiendoInvitacion, setRespondiendoInvitacion] = useState<string | null>(null);

  // Hogar que el resto del dashboard (Actividad reciente, Accesos rápidos)
  // toma como referencia. Es una selección local a esta pantalla -- no toca
  // `usuarios.hogar_id` (el "hogar activo" real que usa el resto de la app y
  // la RLS) -- así que cambiarla acá nunca afecta a qué hogar apunta crear
  // un hogar/aceptar una solicitud en otro lado.
  const [hogarSeleccionadoId, setHogarSeleccionadoId] = useState<string | null>(null);
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

  // Si la selección actual ya no es válida (todavía no se eligió ninguna,
  // o el hogar seleccionado se dejó/expulsó/etc.), se reemplaza por el
  // "hogar activo" de siempre (usuario.hogar_id) si sigue siendo uno de mis
  // hogares, o si no por el primero de la lista. Si ya hay una selección
  // válida, se respeta -- no se le pisa la elección al usuario cada vez que
  // se recarga la lista por otro motivo (crear/salir de OTRO hogar, etc.).
  useEffect(() => {
    if (misHogares.length === 0) {
      if (hogarSeleccionadoId !== null) setHogarSeleccionadoId(null);
      return;
    }

    const sigueSiendoValida = misHogares.some((h) => h.id === hogarSeleccionadoId);
    if (sigueSiendoValida) return;

    const activo = misHogares.find((h) => h.id === usuario?.hogar_id);
    setHogarSeleccionadoId((activo ?? misHogares[0]).id);
  }, [misHogares, hogarSeleccionadoId, usuario?.hogar_id]);

  const cargarActividad = useCallback(async (hogarId: string) => {
    setActividadLoading(true);
    try {
      setActividad(await listarActividadReciente(hogarId));
    } catch (err) {
      console.warn('[Stocky] No se pudo cargar la actividad reciente:', err);
    } finally {
      setActividadLoading(false);
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

  // Se recarga cada vez que cambia la lista de hogares (alta/baja de un
  // hogar), pasándole los IDs explícitos en vez de dejar que la RLS
  // filtre sola (mismo motivo que el resto de las queries "mis X" de este
  // archivo/servicio -- ver docs/incidentes-sprint2.md #2).
  useEffect(() => {
    let cancelado = false;
    const hogarIds = misHogares.map((h) => h.id);

    setProductosPorVencerLoading(true);
    listarProductosProximosAVencer(hogarIds)
      .then((productos) => {
        if (!cancelado) setProductosPorVencer(productos);
      })
      .catch((err) => {
        console.warn('[Stocky] No se pudieron cargar los productos próximos a vencer:', err);
      })
      .finally(() => {
        if (!cancelado) setProductosPorVencerLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [misHogares]);

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
  useEffect(() => {
    if (!usuario?.id) return;

    const canal = supabase
      .channel(`hogar_miembros_usuario_${usuario.id}`)
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
            avisar('Te invitaron a un hogar', 'Alguien te invitó a sumarte a su hogar. Podés aceptar o rechazar desde Home.');
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

          avisar('Solicitud aceptada', 'El dueño del hogar aceptó tu solicitud. Ya sos miembro.');
          cargarMisHogares();
          cargarMisSolicitudes();
          refreshUsuario();
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        (payload) => {
          const anterior = payload.old as { estado?: string; origen?: string } | null;

          // Mismo caso que en UPDATE: si era una invitación pendiente, quien
          // la borra al rechazarla es uno mismo -- sin aviso redundante.
          if (anterior?.estado === 'pendiente' && anterior.origen === 'invitacion') {
            cargarMisInvitaciones();
            return;
          }

          if (anterior?.estado === 'pendiente') {
            avisar('Solicitud rechazada', 'El dueño del hogar rechazó tu solicitud para unirte.');
          } else {
            avisar('Te sacaron de un hogar', 'Ya no formás parte de ese hogar.');
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
      .channel(`hogar_miembros_solicitudes_${usuario.id}`)
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
  function handleIrAProductos(abrirAgregar: boolean) {
    if (!hogarSeleccionado) {
      avisar('Todavía no tenés un hogar', 'Creá o unite a un hogar primero para poder cargar productos.');
      return;
    }
    navigation.navigate('Productos', { hogarId: hogarSeleccionado.id, hogarNombre: hogarSeleccionado.nombre, abrirAgregar });
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

    try {
      await cancelarSolicitud(solicitud.hogarId);
      await cargarMisSolicitudes();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cancelar la solicitud.');
    }
  }

  // Toques cortos sobre tabs que todavía no tienen pantalla propia
  // (Búsqueda, Notificaciones y Perfil). "Home" no hace nada porque ya
  // estamos ahí.
  function handleTabPress(tab: 'home' | 'search' | 'notifications' | 'profile') {
    if (tab === 'search' || tab === 'notifications' || tab === 'profile') {
      avisar('Próximamente', 'Esta sección todavía no está disponible.');
    }
  }

  // Toca un producto de "Productos próximos a vencer": va directo a la
  // pantalla de Productos del hogar al que pertenece (mismo patrón que el
  // ícono de canasta de "Tus hogares activos").
  function handleVerProductoPorVencer(producto: Producto) {
    const hogar = misHogares.find((h) => h.id === producto.hogar_id);
    if (!hogar) return;
    navigation.navigate('Productos', { hogarId: hogar.id, hogarNombre: hogar.nombre });
  }

  return (
    <ScreenContainer style={styles.container} noPadding>
      <View style={styles.padded}>
        <Header nombre={usuario?.nombre} />
      </View>

      {/* Contenido scrolleable entre el header y la nav bar fija */}
      <ScrollView
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
                  <View style={styles.hogaresList}>
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
                        <Text style={styles.hogarNombre} numberOfLines={1}>
                          🏠 {hogarSeleccionado.nombre}
                        </Text>
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
              <View style={styles.hogaresAccionesRow}>
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
                        <Text style={styles.hogarNombre} numberOfLines={1}>
                          🏠 {solicitud.nombreHogar}
                        </Text>
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
                      <Text style={styles.hogarNombre} numberOfLines={1}>
                        🏠 {invitacion.nombreHogar}
                      </Text>
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
            <SectionCard title="Productos próximos a vencer">
              {productosPorVencerLoading ? (
                <ActivityIndicator color={colors.primary} />
              ) : productosPorVencer.length === 0 ? (
                <EmptyState icon="checkmark-circle-outline" text="No tenés productos por vencer en los próximos días." />
              ) : (
                <View style={styles.hogaresList}>
                  {productosPorVencer.map((producto) => {
                    const hogar = misHogares.find((h) => h.id === producto.hogar_id);
                    const estado = estadoVencimiento(producto);
                    const etiqueta = etiquetaVencimiento(producto);
                    return (
                      <Pressable key={producto.id} style={styles.hogarRow} onPress={() => handleVerProductoPorVencer(producto)}>
                        <View style={styles.hogarInfo}>
                          <Text style={styles.hogarNombre} numberOfLines={1}>
                            {producto.nombre}
                          </Text>
                          <Text style={styles.hogarCodigo} numberOfLines={1}>
                            {hogar?.nombre ?? ''}
                          </Text>
                        </View>
                        {etiqueta && (
                          <View style={[styles.vencimientoBadge, estado === 'vencido' && styles.vencimientoBadgeVencido]}>
                            <Text style={styles.vencimientoBadgeTexto}>{etiqueta}</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </SectionCard>

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
                <QuickAccessButton icon="add-circle-outline" label="Agregar producto" onPress={() => handleIrAProductos(true)} />
                <QuickAccessButton icon="basket-outline" label="Ver despensa" onPress={() => handleIrAProductos(false)} />
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

        {/* Se mantiene visible mientras no exista una pantalla de Perfil
            propia desde donde cerrar sesión. */}
        <Button label="Cerrar sesión" variant="outline" onPress={() => signOut()} style={styles.signOutButton} />
      </ScrollView>

      <BottomNavBar active="home" onTabPress={handleTabPress} />

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
function EmptyState({ icon, text, actionLabel, onAction }: EmptyStateProps) {
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
}

// Botón cuadrado de acceso rápido (ícono arriba, label abajo). Por ahora
// todos disparan un placeholder hasta que existan sus pantallas.
function QuickAccessButton({ icon, label, onPress }: QuickAccessButtonProps) {
  return (
    <Pressable style={styles.quickAccessButton} onPress={onPress}>
      <Ionicons name={icon} size={26} color={colors.primary} />
      <Text style={styles.quickAccessLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 0,
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
  // RF2/RF3: mismo criterio de color que el badge de ProductosScreen (ver
  // colors.stockStatus en src/theme/colors.ts) para que la alerta se lea
  // igual en las dos pantallas.
  vencimientoBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.stockStatus.critical,
  },
  vencimientoBadgeVencido: {
    backgroundColor: colors.stockStatus.expired,
  },
  vencimientoBadgeTexto: {
    ...typography.caption,
    color: colors.white,
    fontSize: 11,
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
  signOutButton: {
    marginTop: spacing.md,
  },
});
