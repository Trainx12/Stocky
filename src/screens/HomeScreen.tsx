import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
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
import { cancelarSolicitud, listarMisHogares, listarMisSolicitudesPendientes, salirDeHogar } from '../services/hogares';
import type { HogarConRol, MiSolicitudPendiente } from '../services/hogares';
import type { Hogar } from '../types/database';
import { supabase } from '../lib/supabase';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Pantalla principal (dashboard) que ve cualquier usuario logueado al
 * entrar a la app: header con saludo + logo, contenido con accesos rápidos
 * a lo que ya existe (hogar, productos) y nav bar inferior fija.
 *
 * "Tus hogares activos" ya lista los hogares reales del usuario (RF5/RF6,
 * ver src/services/hogares.ts). "Actividad reciente" sigue mostrando un
 * estado vacío a propósito: todavía no existe ningún log de actividad que
 * mostrar ahí (RF de un sprint siguiente) — se deja la estructura visual
 * lista para no tener que rehacer el layout cuando esa parte llegue.
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

  // Hogar que el resto del dashboard (Actividad reciente, Accesos rápidos)
  // toma como referencia. Es una selección local a esta pantalla -- no toca
  // `usuarios.hogar_id` (el "hogar activo" real que usa el resto de la app y
  // la RLS) -- así que cambiarla acá nunca afecta a qué hogar apunta crear
  // un hogar/aceptar una solicitud en otro lado.
  const [hogarSeleccionadoId, setHogarSeleccionadoId] = useState<string | null>(null);
  const [cambiarHogarVisible, setCambiarHogarVisible] = useState(false);
  const hogarSeleccionado = misHogares.find((h) => h.id === hogarSeleccionadoId) ?? null;

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

  useEffect(() => {
    cargarMisHogares();
    cargarMisSolicitudes();
  }, [cargarMisHogares, cargarMisSolicitudes]);

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
        { event: 'UPDATE', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        (payload) => {
          const anterior = payload.old as { estado?: string } | null;
          const actual = payload.new as { estado?: string } | null;
          if (anterior?.estado === 'pendiente' && actual?.estado === 'aprobado') {
            avisar('Solicitud aceptada', 'El dueño del hogar aceptó tu solicitud. Ya sos miembro.');
            cargarMisHogares();
            cargarMisSolicitudes();
            refreshUsuario();
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        (payload) => {
          const anterior = payload.old as { estado?: string } | null;
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
  }, [usuario?.id, cargarMisHogares, cargarMisSolicitudes, refreshUsuario]);

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

  // Accesos rápidos "Agregar producto" / "Ver despensa": van directo al
  // hogar elegido en "Cambiar hogar" arriba de todo, sin preguntar nada --
  // si hay más de uno (RF6), para eso está el selector.
  function handleIrAProductos() {
    if (!hogarSeleccionado) {
      avisar('Todavía no tenés un hogar', 'Creá o unite a un hogar primero para poder cargar productos.');
      return;
    }
    navigation.navigate('Productos', { hogarId: hogarSeleccionado.id, hogarNombre: hogarSeleccionado.nombre });
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

  return (
    <ScreenContainer style={styles.container} noPadding>
      <View style={styles.padded}>
        {/* Arriba de todo, antes del saludo: a qué hogar se refiere el
            resto del dashboard (Actividad reciente, Accesos rápidos).
            Solo tiene sentido mostrarlo si hay algo entre qué elegir. */}
        {hogarSeleccionado && (
          <Pressable
            style={styles.cambiarHogarButton}
            onPress={() => setCambiarHogarVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={`Cambiar hogar, mostrando ${hogarSeleccionado.nombre}`}
          >
            <Ionicons name="home-outline" size={16} color={colors.primary} />
            <Text style={styles.cambiarHogarTexto} numberOfLines={1}>
              Cambiar hogar · {hogarSeleccionado.nombre}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.primary} />
          </Pressable>
        )}

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
                // Puede haber más de uno (RF6): se listan todos, no solo
                // el "hogar activo" de usuario.hogar_id.
                <View style={styles.hogaresList}>
                  {misHogares.map((hogar) => (
                    <View key={hogar.id} style={styles.hogarRow}>
                      <View style={styles.hogarInfo}>
                        <Text style={styles.hogarNombre} numberOfLines={1}>
                          🏠 {hogar.nombre}
                        </Text>
                        <Text style={styles.hogarCodigo}>
                          Código: {hogar.codigo_invitacion} · {hogar.miRol === 'dueno' ? 'Dueño' : 'Invitado'}
                        </Text>
                      </View>
                      <View style={styles.hogarAcciones}>
                        <Pressable
                          onPress={() => navigation.navigate('Productos', { hogarId: hogar.id, hogarNombre: hogar.nombre })}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Productos de ${hogar.nombre}`}
                        >
                          <Ionicons name="basket-outline" size={18} color={colors.textSecondary} />
                        </Pressable>
                        <Pressable
                          onPress={() => setHogarMiembrosVisible(hogar)}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={
                            hogar.solicitudesPendientes > 0
                              ? `Miembros de ${hogar.nombre}, ${hogar.solicitudesPendientes} solicitud${hogar.solicitudesPendientes === 1 ? '' : 'es'} pendiente${hogar.solicitudesPendientes === 1 ? '' : 's'}`
                              : `Miembros de ${hogar.nombre}`
                          }
                        >
                          <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
                          {hogar.solicitudesPendientes > 0 && <View style={styles.solicitudDot} />}
                        </Pressable>
                        {/* Editar el nombre está restringido al dueño por
                            default; un invitado solo lo ve si el dueño le
                            habilitó el permiso (ver "Miembros del hogar"). */}
                        {hogar.puedoEditar && (
                          <Pressable
                            onPress={() => setHogarEditando(hogar)}
                            style={styles.hogarAccionButton}
                            accessibilityRole="button"
                            accessibilityLabel={`Editar ${hogar.nombre}`}
                          >
                            <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                          </Pressable>
                        )}
                        <Pressable
                          onPress={() => handleSalirDeHogar(hogar)}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Salir de ${hogar.nombre}`}
                        >
                          <Ionicons name="exit-outline" size={18} color={colors.danger} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
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

            <SectionCard title="Actividad reciente">
              <EmptyState
                icon="time-outline"
                text={
                  hogarSeleccionado
                    ? `Todavía no hay movimientos para mostrar en "${hogarSeleccionado.nombre}".`
                    : 'Todavía no hay movimientos para mostrar.'
                }
              />
            </SectionCard>

            <SectionCard title="Accesos rápidos">
              <View style={styles.quickAccessRow}>
                <QuickAccessButton icon="add-circle-outline" label="Agregar producto" onPress={handleIrAProductos} />
                <QuickAccessButton icon="basket-outline" label="Ver despensa" onPress={handleIrAProductos} />
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
