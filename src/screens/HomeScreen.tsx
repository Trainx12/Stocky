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
import { ManageHomesSheet } from '../components/ManageHomesSheet';
import { HogarFormModal } from '../components/HogarFormModal';
import { HogarMiembrosModal } from '../components/HogarMiembrosModal';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../services/auth';
import {
  listarMisHogares,
  listarMisInvitacionesPendientes,
  listarMisSolicitudesPendientes,
  responderInvitacion,
  salirDeHogar,
} from '../services/hogares';
import type { HogarConRol, MiInvitacionPendiente, MiSolicitudPendiente } from '../services/hogares';
import type { Hogar } from '../types/database';
import { supabase } from '../lib/supabase';
import { avisar, confirmar } from '../lib/alert';
import { colors, spacing, typography } from '../theme';

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

  // Controla si el bottom sheet "Gestionar Mis Hogares" está abierto.
  // Se dispara con un long-press sobre el ícono de Perfil de la nav bar.
  const [sheetVisible, setSheetVisible] = useState(false);
  // Modales de "Crear Nuevo Hogar" y "Unirme a un Hogar" (mismo
  // HogarFormModal, distinto mode), disparados desde las dos opciones del
  // sheet de arriba.
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

  // Accesos rápidos "Agregar producto" / "Ver despensa": si el usuario
  // tiene un solo hogar no hace falta preguntarle cuál, se navega directo.
  // Con más de uno (RF6) sería ambiguo, así que se lo manda a elegir desde
  // el ícono de canasta de cada fila en "Tus hogares activos".
  function handleIrAProductos() {
    if (misHogares.length === 0) {
      avisar('Todavía no tenés un hogar', 'Creá o unite a un hogar primero para poder cargar productos.');
      return;
    }
    if (misHogares.length === 1) {
      const [hogar] = misHogares;
      navigation.navigate('Productos', { hogarId: hogar.id, hogarNombre: hogar.nombre });
      return;
    }
    avisar('Elegí un hogar', 'Tocá el ícono de canasta 🧺 en "Tus hogares activos" para ver los productos de ese hogar.');
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

  // Toques cortos sobre tabs que todavía no tienen pantalla propia
  // (Búsqueda y Notificaciones). "Home" no hace nada porque ya estamos ahí,
  // y "Perfil" en toque corto tampoco navega todavía (solo reacciona al
  // long-press, definido en BottomNavBar).
  function handleTabPress(tab: 'home' | 'search' | 'notifications' | 'profile') {
    if (tab === 'search' || tab === 'notifications') {
      avisar('Próximamente', 'Esta sección todavía no está disponible.');
    }
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
                <EmptyState
                  icon="home-outline"
                  text="Todavía no formás parte de ningún hogar."
                  actionLabel="Crear mi primer hogar"
                  onAction={handleCrearHogar}
                />
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
            </SectionCard>

            {/* Solo aparece si mandé alguna solicitud que el dueño todavía
                no resolvió -- no confundir con "Tus hogares activos" (esos
                ya son membresías aceptadas). */}
            {misSolicitudes.length > 0 && (
              <SectionCard title="Solicitudes que enviaste">
                <View style={styles.hogaresList}>
                  {misSolicitudes.map((solicitud) => (
                    <View key={solicitud.hogarId} style={styles.hogarRow}>
                      <Text style={styles.hogarNombre} numberOfLines={1}>
                        🏠 {solicitud.nombreHogar}
                      </Text>
                      <Text style={styles.hogarCodigo}>Esperando respuesta del dueño</Text>
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

            <SectionCard title="Actividad reciente">
              <EmptyState icon="time-outline" text="Todavía no hay movimientos para mostrar." />
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

      <BottomNavBar active="home" onTabPress={handleTabPress} onProfileLongPress={() => setSheetVisible(true)} />

      <ManageHomesSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onCrearHogar={handleCrearHogar}
        onUnirseAHogar={handleUnirseAHogar}
      />

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
