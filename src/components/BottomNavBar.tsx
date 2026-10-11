import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing, typography } from '../theme';
import { textoGlobito } from '../services/notificaciones';

type TabKey = 'home' | 'search' | 'notifications' | 'profile';

// Nombres de ícono de Ionicons para cada tab, en estado inactivo y activo
// (versión "outline" vs. rellena) para dar feedback visual de cuál está
// seleccionado sin necesitar una imagen distinta por estado.
const ICONS: Record<TabKey, { outline: keyof typeof Ionicons.glyphMap; filled: keyof typeof Ionicons.glyphMap }> = {
  home: { outline: 'home-outline', filled: 'home' },
  search: { outline: 'search-outline', filled: 'search' },
  notifications: { outline: 'notifications-outline', filled: 'notifications' },
  profile: { outline: 'person-outline', filled: 'person' },
};

interface BottomNavBarProps {
  /** Tab actualmente activo; por ahora solo existe la pantalla Home, así que arranca fijo en 'home'. */
  active?: TabKey;
  /**
   * Toque corto en cualquier tab. HomeScreen decide qué hacer: la lupa
   * (search) abre el buscador de la despensa del hogar seleccionado;
   * notifications abre la campanita (NotificacionesScreen); profile todavía muestra un aviso de
   * "próximamente". Crear/unirse a un hogar ya no
   * pasa por acá (antes era un long-press sobre "Perfil"): son botones
   * directos debajo de "Tus hogares activos" en HomeScreen, sin gestos
   * escondidos.
   */
  onTabPress?: (tab: TabKey) => void;
  /** Notificaciones sin leer: si hay alguna, la campanita muestra el número (9+ si son más). */
  notificacionesSinLeer?: number;
}

/**
 * Barra de navegación inferior fija, con los 4 accesos estándar de la app.
 * Es una barra "visual" simple (no un Tab.Navigator de react-navigation)
 * porque hoy solo existe la pantalla Home en el stack logueado; cuando se
 * agreguen Search/Notifications/Perfil como pantallas reales (próximos
 * sprints), este componente se puede reemplazar por un
 * createBottomTabNavigator sin tocar el resto de HomeScreen.
 */
export function BottomNavBar({ active = 'home', onTabPress, notificacionesSinLeer = 0 }: BottomNavBarProps) {
  // Se resalta el ícono mientras el dedo lo mantiene presionado (feedback
  // visual inmediato del toque, aparte del círculo claro del mockup).
  const [pressedTab, setPressedTab] = useState<TabKey | null>(null);

  const tabs: TabKey[] = ['home', 'search', 'notifications', 'profile'];

  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const isActive = tab === active;
        const isPressed = tab === pressedTab;
        const iconName = isActive ? ICONS[tab].filled : ICONS[tab].outline;
        const globito = tab === 'notifications' ? textoGlobito(notificacionesSinLeer) : null;

        return (
          <Pressable
            key={tab}
            onPress={() => onTabPress?.(tab)}
            onPressIn={() => setPressedTab(tab)}
            onPressOut={() => setPressedTab(null)}
            style={styles.tab}
            // Accesibilidad: que un lector de pantalla anuncie qué botón es.
            accessibilityRole="button"
            accessibilityLabel={globito ? `${tab}, ${notificacionesSinLeer} sin leer` : tab}
          >
            {/* Círculo claro de fondo cuando el tab está activo o siendo presionado, como en el mockup */}
            <View style={[styles.iconWrapper, (isActive || isPressed) && styles.iconWrapperHighlighted]}>
              <Ionicons name={iconName} size={24} color={isActive ? colors.primary : colors.textSecondary} />
              {globito && (
                <View style={styles.globito}>
                  <Text style={styles.globitoTexto}>{globito}</Text>
                </View>
              )}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperHighlighted: {
    backgroundColor: colors.primaryLight,
  },
  // Numerito de notificaciones sin leer, arriba a la derecha de la campanita.
  globito: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  globitoTexto: {
    ...typography.caption,
    color: colors.white,
    fontSize: 10,
    lineHeight: 12,
  },
});
