import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { ETIQUETA_TIPO_COMENTARIO, listarComentarios } from '../services/comentarios';
import { tiempoRelativo } from '../services/notificaciones';
import type { ComentarioConAutor, TipoComentario } from '../types/database';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'AdminComentarios'>;

// Ícono por tipo de comentario.
const ICONO: Record<TipoComentario, keyof typeof Ionicons.glyphMap> = {
  idea: 'bulb-outline',
  problema: 'bug-outline',
  otro: 'chatbubble-outline',
};

/**
 * Admin: comentarios que mandan los usuarios desde Cuenta → "Contanos qué
 * mejorar", los más nuevos primero. Mismo gateo que AdminUsuarios: Home
 * solo ofrece el acceso a admins y la función de la base
 * (admin_listar_comentarios) rechaza a cualquier otro.
 */
export function AdminComentariosScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const [comentarios, setComentarios] = useState<ComentarioConAutor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setComentarios(await listarComentarios());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar los comentarios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Comentarios</Text>
        <Pressable onPress={cargar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Recargar">
          <Ionicons name="refresh" size={22} color={colors.primary} />
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : comentarios.length === 0 ? (
        <Text style={styles.vacio}>Todavía no llegó ningún comentario.</Text>
      ) : (
        <ScrollView contentContainerStyle={styles.lista}>
          {comentarios.map((c) => (
            <View key={c.id} style={styles.tarjeta}>
              <View style={styles.fila}>
                <Ionicons name={ICONO[c.tipo]} size={18} color={colors.primary} />
                <Text style={styles.tipo}>{ETIQUETA_TIPO_COMENTARIO[c.tipo]}</Text>
                <Text style={styles.meta}>
                  {tiempoRelativo(c.created_at)} · {c.plataforma ?? '?'} {c.version_app ?? ''}
                </Text>
              </View>
              <Text style={styles.mensaje}>{c.mensaje}</Text>
              <Text style={styles.autor}>{c.usuario_nombre ?? c.usuario_email ?? 'Cuenta borrada'}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </ScreenContainer>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
    container: {
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    title: {
      ...typography.h2,
      color: colors.textPrimary,
      flex: 1,
    },
    loader: {
      marginTop: spacing.xl,
    },
    error: {
      ...typography.body,
      color: colors.danger,
      textAlign: 'center',
    },
    vacio: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: spacing.xl,
    },
    lista: {
      gap: spacing.sm,
      paddingBottom: spacing.xl,
    },
    tarjeta: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    tipo: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    meta: {
      ...typography.caption,
      color: colors.textSecondary,
      marginLeft: 'auto',
    },
    mensaje: {
      ...typography.body,
      color: colors.textPrimary,
    },
    autor: {
      ...typography.caption,
      color: colors.textSecondary,
    },
  });
