import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
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
import { listarMisHogares, salirDeHogar } from '../services/hogares';
import type { HogarConRol } from '../services/hogares';
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

  useEffect(() => {
    cargarMisHogares();
  }, [cargarMisHogares]);

  // Si el dueño de un hogar me expulsa MIENTRAS tengo la app abierta, mi
  // fila en hogar_miembros se borra del lado del servidor -- sin esta
  // suscripción realtime, mi pantalla seguía mostrando ese hogar hasta que
  // yo recargara a mano. Quien expulsa ya ve el cambio al instante porque
  // es su propia acción (ManageHomesListModal recarga después del RPC);
  // esto cubre al OTRO usuario, el expulsado.
  useEffect(() => {
    if (!usuario?.id) return;

    const canal = supabase
      .channel(`hogar_miembros_usuario_${usuario.id}`)
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'hogar_miembros', filter: `usuario_id=eq.${usuario.id}` },
        () => {
          avisar('Te sacaron de un hogar', 'Ya no formás parte de ese hogar.');
          cargarMisHogares();
          refreshUsuario();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [usuario?.id, cargarMisHogares, refreshUsuario]);

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

  // Después de crear o unirse a un hogar: refresca tanto la lista de
  // hogares de esta pantalla como `usuario` del AuthContext (por si
  // `hogar_id` pasó de null a un valor, que es lo que usa el resto de la
  // app como "hogar activo"). Cierra los dos modales sin problema, porque
  // solo uno de los dos puede estar abierto a la vez.
  async function handleHogarCreadoOUnido() {
    setCrearVisible(false);
    setUnirseVisible(false);
    await Promise.all([cargarMisHogares(), refreshUsuario()]);
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
                          onPress={() => setHogarMiembrosVisible(hogar)}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Miembros de ${hogar.nombre}`}
                        >
                          <Ionicons name="people-outline" size={18} color={colors.textSecondary} />
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

            <SectionCard title="Actividad reciente">
              <EmptyState icon="time-outline" text="Todavía no hay movimientos para mostrar." />
            </SectionCard>

            <SectionCard title="Accesos rápidos">
              <View style={styles.quickAccessRow}>
                <QuickAccessButton
                  icon="add-circle-outline"
                  label="Agregar producto"
                  onPress={() =>
                    avisar('Agregar producto', 'Esta sección todavía no está lista, llega en un próximo sprint.')
                  }
                />
                <QuickAccessButton
                  icon="basket-outline"
                  label="Ver despensa"
                  onPress={() =>
                    avisar('Ver despensa', 'Esta sección todavía no está lista, llega en un próximo sprint.')
                  }
                />
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
        onSuccess={handleHogarCreadoOUnido}
      />

      <HogarFormModal
        visible={unirseVisible}
        mode="unirse"
        onClose={() => setUnirseVisible(false)}
        onSuccess={handleHogarCreadoOUnido}
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
