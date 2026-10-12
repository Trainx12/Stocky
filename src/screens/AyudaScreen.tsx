import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { buscarEnAyuda, TEMAS_AYUDA } from '../ayuda/contenido';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'Ayuda'>;

/**
 * Ayuda (botón "?" arriba a la derecha del Home): cómo hacer lo básico en
 * Stocky, paso a paso y nombrando los botones como se ven en la app. El
 * texto está en src/ayuda/contenido.ts. Cada tema se abre y se cierra al
 * tocarlo (arrancan cerrados para que se vea la lista entera), y hay un
 * buscador por palabra ("ticket", "vencimiento", "invitar"...).
 */
export function AyudaScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const [busqueda, setBusqueda] = useState('');
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const temas = useMemo(() => buscarEnAyuda(TEMAS_AYUDA, busqueda), [busqueda]);
  // Con una búsqueda escrita se muestran los resultados ya abiertos.
  const buscando = busqueda.trim() !== '';

  function alternar(id: string) {
    setAbiertos((actuales) => {
      const siguientes = new Set(actuales);
      if (siguientes.has(id)) siguientes.delete(id);
      else siguientes.add(id);
      return siguientes;
    });
  }

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Ayuda</Text>
      </View>

      <TextInput
        style={styles.buscador}
        placeholder="¿Qué querés hacer? (ej: ticket, vencimiento)"
        placeholderTextColor={colors.textSecondary}
        value={busqueda}
        onChangeText={setBusqueda}
        autoCapitalize="none"
      />

      <ScrollView style={styles.lista} contentContainerStyle={styles.listaContenido} showsVerticalScrollIndicator={false}>
        {temas.length === 0 ? (
          <Text style={styles.vacio}>No encontramos nada con "{busqueda}". Probá con otra palabra.</Text>
        ) : (
          temas.map((tema) => {
            const abierto = buscando || abiertos.has(tema.id);
            return (
              <View key={tema.id} style={styles.tema}>
                <Pressable
                  onPress={() => alternar(tema.id)}
                  style={styles.temaEncabezado}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: abierto }}
                >
                  <View style={styles.iconoCirculo}>
                    <Ionicons name={tema.icono as keyof typeof Ionicons.glyphMap} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.temaTextos}>
                    <Text style={styles.temaTitulo}>{tema.titulo}</Text>
                    <Text style={styles.temaResumen}>{tema.resumen}</Text>
                  </View>
                  <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSecondary} />
                </Pressable>

                {abierto && (
                  <View style={styles.pasos}>
                    {tema.pasos.map((paso, i) => (
                      <View key={i} style={styles.paso}>
                        <View style={styles.numero}>
                          <Text style={styles.numeroTexto}>{i + 1}</Text>
                        </View>
                        <Text style={styles.pasoTexto}>{paso}</Text>
                      </View>
                    ))}
                    {tema.consejo && (
                      <View style={styles.consejo}>
                        <Ionicons name="bulb-outline" size={16} color={colors.primaryDark} />
                        <Text style={styles.consejoTexto}>{tema.consejo}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
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
    },
    buscador: {
      ...typography.body,
      color: colors.textPrimary,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
    },
    lista: {
      flex: 1,
    },
    listaContenido: {
      gap: spacing.sm,
      paddingBottom: spacing.xl,
    },
    vacio: {
      ...typography.body,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    tema: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    temaEncabezado: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
    },
    iconoCirculo: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    temaTextos: {
      flex: 1,
      gap: 2,
    },
    temaTitulo: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
    },
    temaResumen: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    pasos: {
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    paso: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    numero: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
    },
    numeroTexto: {
      ...typography.caption,
      fontSize: 12,
      lineHeight: 16,
      color: colors.white,
    },
    pasoTexto: {
      ...typography.body,
      fontSize: 14,
      lineHeight: 21,
      color: colors.textPrimary,
      flex: 1,
    },
    consejo: {
      flexDirection: 'row',
      gap: spacing.sm,
      backgroundColor: colors.primaryLight,
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    consejoTexto: {
      ...typography.caption,
      color: colors.primaryDark,
      flex: 1,
    },
  });
