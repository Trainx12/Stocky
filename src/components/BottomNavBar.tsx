import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors, spacing } from '../theme';

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
   * Toque corto en cualquier tab que todavía no tiene pantalla propia
   * (search/notifications/profile). HomeScreen decide qué hacer con eso
   * (por ahora, un aviso de "próximamente").
   */
  onTabPress?: (tab: TabKey) => void;
  /**
   * Toque largo específicamente sobre "Perfil": dispara el bottom sheet
   * "Gestionar Mis Hogares" (RF de creación/administración de hogar).
   */
  onProfileLongPress: () => void;
}

/**
 * Barra de navegación inferior fija, con los 4 accesos estándar de la app.
 * Es una barra "visual" simple (no un Tab.Navigator de react-navigation)
 * porque hoy solo existe la pantalla Home en el stack logueado; cuando se
 * agreguen Search/Notifications/Perfil como pantallas reales (próximos
 * sprints), este componente se puede reemplazar por un
 * createBottomTabNavigator sin tocar el resto de HomeScreen.
 */
export function BottomNavBar({ active = 'home', onTabPress, onProfileLongPress }: BottomNavBarProps) {
  // Se resalta el ícono mientras el dedo lo mantiene presionado (feedback
  // visual del long-press en curso, aparte del círculo claro del mockup).
  const [pressedTab, setPressedTab] = useState<TabKey | null>(null);

  const tabs: TabKey[] = ['home', 'search', 'notifications', 'profile'];

  return (
    <View style={styles.bar}>
      {tabs.map((tab) => {
        const isActive = tab === active;
        const isPressed = tab === pressedTab;
        const iconName = isActive ? ICONS[tab].filled : ICONS[tab].outline;

        return (
          <Pressable
            key={tab}
            onPress={() => onTabPress?.(tab)}
            // Solo "profile" tiene comportamiento de long-press (abrir el
            // menú de hogares); en los demás tabs no pasa nada especial.
            onLongPress={tab === 'profile' ? onProfileLongPress : undefined}
            delayLongPress={400}
            onPressIn={() => setPressedTab(tab)}
            onPressOut={() => setPressedTab(null)}
            style={styles.tab}
            // Accesibilidad: que un lector de pantalla anuncie qué botón es.
            accessibilityRole="button"
            accessibilityLabel={tab}
          >
            {/* Círculo claro de fondo cuando el tab está activo o siendo presionado, como en el mockup */}
            <View style={[styles.iconWrapper, (isActive || isPressed) && styles.iconWrapperHighlighted]}>
              <Ionicons name={iconName} size={24} color={isActive ? colors.primary : colors.textSecondary} />
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
});
