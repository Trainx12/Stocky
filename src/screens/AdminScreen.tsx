import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { BottomNavBar } from '../components/BottomNavBar';
import type { TabKey } from '../components/BottomNavBar';
import { useAuth } from '../context/AuthContext';
import { useNotificaciones } from '../context/NotificacionesContext';
import { obtenerMetricas, tarjetasDeMetricas } from '../services/admin';
import type { MetricasAdmin } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'Admin'>;

/**
 * Panel de administración (escudo de la barra de abajo, solo admins). Arriba
 * las métricas de uso (RF10, services/admin.ts) y abajo todo lo que maneja
 * un admin: usuarios, sugerencias, catálogo, comentarios y el registro de
 * lo que hicieron los admins.
 *
 * Si alguien que no es admin llega acá, la base le niega todo
 * (admin_metricas y el resto chequean es_administrador()): se muestra el
 * aviso de acceso restringido.
 */
export function AdminScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const { usuario } = useAuth();
  const { noLeidas } = useNotificaciones();
  const [metricas, setMetricas] = useState<MetricasAdmin | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setMetricas(await obtenerMetricas());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las métricas.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Se recarga cada vez que se vuelve al panel (por ejemplo, después de
  // aprobar sugerencias, para que baje el número de pendientes).
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar]),
  );

  function handleTabPress(tab: TabKey) {
    if (tab === 'home') navigation.navigate('Home');
    else if (tab === 'search') navigation.navigate('Home', { abrirBuscador: true });
    else if (tab === 'notifications') navigation.navigate('Notificaciones');
    else if (tab === 'profile') navigation.navigate('Cuenta');
  }

  const esAdmin = usuario?.rol === 'administrador';
  const pendientes = metricas?.sugerencias_pendientes ?? 0;

  return (
    <ScreenContainer style={styles.container} noPadding>
      <ScrollView style={styles.padded} contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Ionicons name="shield-checkmark" size={28} color={colors.primary} />
          <View style={styles.headerTextos}>
            <Text style={styles.title}>Administración</Text>
            <Text style={styles.subtitulo}>Métricas y gestión de Stocky</Text>
          </View>
          <Pressable onPress={cargar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Actualizar métricas">
            <Ionicons name="refresh" size={22} color={colors.primary} />
          </Pressable>
        </View>

        {!esAdmin ? (
          <Text style={styles.error}>Esta sección es solo para administradores.</Text>
        ) : (
          <>
            {/* Métricas (RF10) */}
            <Text style={styles.seccion}>Métricas</Text>
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : error ? (
              <Text style={styles.error}>{error}</Text>
            ) : metricas ? (
              <View style={styles.grilla}>
                {tarjetasDeMetricas(metricas).map((t) => (
                  <View key={t.clave} style={styles.metrica} accessible accessibilityLabel={`${t.valor} ${t.titulo}, ${t.detalle}`}>
                    <Text style={styles.metricaValor}>{t.valor}</Text>
                    <Text style={styles.metricaTitulo}>{t.titulo}</Text>
                    <Text style={styles.metricaDetalle}>{t.detalle}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text style={styles.nota}>"Activos" = con algún movimiento de productos en los últimos 30 días.</Text>

            {/* Gestión */}
            <Text style={styles.seccion}>Gestión</Text>
            <View style={styles.tarjeta}>
              <Fila
                icono="people-outline"
                titulo="Usuarios"
                detalle="Habilitar, deshabilitar y dar o quitar el rol de admin"
                onPress={() => navigation.navigate('AdminUsuarios')}
              />
              <Fila
                icono="pricetags-outline"
                titulo="Sugerencias de productos"
                detalle={pendientes === 0 ? 'No hay sugerencias pendientes' : `${pendientes} pendiente${pendientes === 1 ? '' : 's'} de revisar`}
                badge={pendientes}
                onPress={() => navigation.navigate('AdminSugerencias')}
                separada
              />
              <Fila
                icono="library-outline"
                titulo="Catálogo"
                detalle="Agregar, corregir o sacar productos del catálogo"
                onPress={() => navigation.navigate('AdminCatalogo')}
                separada
              />
              <Fila
                icono="chatbubbles-outline"
                titulo="Comentarios de usuarios"
                detalle="Lo que mandan desde Cuenta → Contanos qué mejorar"
                onPress={() => navigation.navigate('AdminComentarios')}
                separada
              />
              <Fila
                icono="list-outline"
                titulo="Registro de acciones"
                detalle="Qué hizo cada administrador y cuándo"
                onPress={() => navigation.navigate('AdminRegistro')}
                separada
              />
            </View>
          </>
        )}
      </ScrollView>

      <BottomNavBar active="admin" onTabPress={handleTabPress} notificacionesSinLeer={noLeidas} />
    </ScreenContainer>
  );
}

// Una fila del menú de gestión: ícono, título, detalle, numerito opcional y flecha.
function Fila({
  icono,
  titulo,
  detalle,
  onPress,
  badge = 0,
  separada,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalle: string;
  onPress: () => void;
  badge?: number;
  separada?: boolean;
}) {
  const styles = useEstilos(crearEstilos);
  return (
    <Pressable onPress={onPress} style={[styles.fila, separada && styles.filaSeparada]} accessibilityRole="button">
      <Ionicons name={icono} size={22} color={colors.primary} />
      <View style={styles.filaTextos}>
        <Text style={styles.filaTitulo}>{titulo}</Text>
        <Text style={styles.filaDetalle}>{detalle}</Text>
      </View>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeTexto}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    container: {
      paddingVertical: 0,
    },
    padded: {
      paddingHorizontal: spacing.lg,
    },
    contenido: {
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    headerTextos: {
      flex: 1,
    },
    title: {
      ...typography.h2,
      color: colors.textPrimary,
    },
    subtitulo: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    seccion: {
      ...typography.bodyMedium,
      color: colors.textSecondary,
      marginTop: spacing.sm,
    },
    error: {
      ...typography.body,
      color: colors.danger,
      textAlign: 'center',
      paddingVertical: spacing.md,
    },
    grilla: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    metrica: {
      flexGrow: 1,
      flexBasis: '45%',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: 2,
    },
    metricaValor: {
      ...typography.h2,
      color: colors.primary,
    },
    metricaTitulo: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    metricaDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    nota: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    tarjeta: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    filaSeparada: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    filaTextos: {
      flex: 1,
      gap: 2,
    },
    filaTitulo: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    filaDetalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
    },
    badgeTexto: {
      ...typography.caption,
      color: colors.white,
    },
  });
