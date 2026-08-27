import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ScreenContainer } from '../components/ScreenContainer';
import { Header } from '../components/Header';
import { SectionCard } from '../components/SectionCard';
import { BottomNavBar } from '../components/BottomNavBar';
import { ManageHomesSheet } from '../components/ManageHomesSheet';
import { HogarFormModal } from '../components/HogarFormModal';
import { ManageHomesListModal } from '../components/ManageHomesListModal';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { signOut } from '../services/auth';
import { listarMisHogares, salirDeHogar } from '../services/hogares';
import { avisar, confirmar } from '../lib/alert';
import type { Hogar } from '../types/database';
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
  // Modal de "Crear Nuevo Hogar" (input de nombre) y de "Administrar Mis
  // Hogares" (lista con opción de salir + unirse a otro), disparados desde
  // las dos opciones del sheet de arriba.
  const [crearVisible, setCrearVisible] = useState(false);
  const [administrarVisible, setAdministrarVisible] = useState(false);

  // Hogares de los que el usuario ya es miembro (puede ser más de uno).
  // Se muestran en "Tus hogares activos"; se recarga después de
  // crear/unirse/salir para que la sección quede siempre al día.
  const [misHogares, setMisHogares] = useState<Hogar[]>([]);
  const [hogaresLoading, setHogaresLoading] = useState(true);
  // Hogar que se está editando desde "Tus hogares activos" (null = cerrado).
  // Reusa el mismo HogarFormModal en modo "editar" que ManageHomesListModal,
  // así el botón de lápiz queda accesible sin pasar por el long-press del
  // ícono de Perfil.
  const [hogarEditando, setHogarEditando] = useState<Hogar | null>(null);

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

  function handleCrearHogar() {
    setCrearVisible(true);
  }

  // Mismo patrón de confirmación que ManageHomesListModal (Administrar Mis
  // Hogares): salir es destructivo, no se dispara sin confirmar antes.
  // Usa confirmar()/avisar() (src/lib/alert.ts) en vez de Alert.alert
  // directo: en react-native-web, Alert.alert con botones es un no-op (no
  // muestra nada ni dispara el onPress), así que el botón de salir no hacía
  // nada en la versión web (ver docs/incidentes-sprint3.md).
  async function handleSalirDeHogar(hogar: Hogar) {
    const confirmado = await confirmar('Salir del hogar', `¿Seguro que querés salir de "${hogar.nombre}"?`, 'Salir');
    if (!confirmado) return;

    try {
      await salirDeHogar(hogar.id);
      await Promise.all([cargarMisHogares(), refreshUsuario()]);
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo salir del hogar.');
    }
  }

  function handleAdministrarHogares() {
    setAdministrarVisible(true);
  }

  // Después de crear o unirse a un hogar: refresca tanto la lista de
  // hogares de esta pantalla como `usuario` del AuthContext (por si
  // `hogar_id` pasó de null a un valor, que es lo que usa el resto de la
  // app como "hogar activo").
  async function handleHogarCreadoOUnido() {
    setCrearVisible(false);
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
                      <Text style={styles.hogarNombre} numberOfLines={1}>
                        🏠 {hogar.nombre}
                      </Text>
                      <View style={styles.hogarAcciones}>
                        <Pressable
                          onPress={() => setHogarEditando(hogar)}
                          style={styles.hogarAccionButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Editar ${hogar.nombre}`}
                        >
                          <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
                        </Pressable>
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
        onAdministrarHogares={handleAdministrarHogares}
      />

      <HogarFormModal
        visible={crearVisible}
        mode="crear"
        onClose={() => setCrearVisible(false)}
        onSuccess={handleHogarCreadoOUnido}
      />

      <ManageHomesListModal
        visible={administrarVisible}
        onClose={() => setAdministrarVisible(false)}
        onChanged={() => {
          cargarMisHogares();
          refreshUsuario();
        }}
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
  hogarNombre: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    flexShrink: 1,
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
