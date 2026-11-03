import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { buscarEnAyuda, TEMAS_AYUDA } from '../ayuda/contenido';
import { borrarHogarDeEjemplo, buscarHogarDeEjemplo, crearHogarDeEjemplo } from '../services/hogarEjemplo';
import { listarMisHogares } from '../services/hogares';
import { avisar, confirmar } from '../lib/alert';
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

  // Hogar de ejemplo (services/hogarEjemplo.ts): se fija si ya hay uno cada
  // vez que se entra, para ofrecer "Probar" o "Ir / Borrar".
  const [ejemplo, setEjemplo] = useState<{ id: string; nombre: string } | null>(null);
  const [trabajandoEjemplo, setTrabajandoEjemplo] = useState(false);
  useFocusEffect(
    useCallback(() => {
      listarMisHogares()
        .then((hogares) => setEjemplo(buscarHogarDeEjemplo(hogares)))
        .catch(() => setEjemplo(null));
    }, []),
  );

  async function handleProbarEjemplo() {
    if (ejemplo) {
      navigation.navigate('Productos', { hogarId: ejemplo.id, hogarNombre: ejemplo.nombre });
      return;
    }
    setTrabajandoEjemplo(true);
    try {
      const hogar = await crearHogarDeEjemplo();
      setEjemplo(hogar);
      avisar('Hogar de ejemplo listo', 'Probá lo que quieras. Cuando termines, lo borrás desde acá.', 'info');
      navigation.navigate('Productos', { hogarId: hogar.id, hogarNombre: hogar.nombre });
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo crear el hogar de ejemplo.');
    } finally {
      setTrabajandoEjemplo(false);
    }
  }

  async function handleBorrarEjemplo() {
    if (!ejemplo) return;
    const ok = await confirmar('Borrar el hogar de ejemplo', 'Se borran sus productos de muestra. Tus hogares no se tocan.', 'Borrar');
    if (!ok) return;
    setTrabajandoEjemplo(true);
    try {
      await borrarHogarDeEjemplo(ejemplo.id);
      setEjemplo(null);
      avisar('Listo', 'Se borró el hogar de ejemplo.', 'exito');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo borrar el hogar de ejemplo.');
    } finally {
      setTrabajandoEjemplo(false);
    }
  }

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

      {/* Tutorial guiado del inicio (src/tutorial/): se vuelve al inicio y arranca. */}
      <Pressable
        onPress={() => navigation.navigate('Home', { verTutorial: true })}
        style={styles.tutorial}
        accessibilityRole="button"
      >
        <Ionicons name="school-outline" size={22} color={colors.white} />
        <View style={styles.tutorialTextos}>
          <Text style={styles.tutorialTitulo}>Ver el tutorial guiado</Text>
          <Text style={styles.tutorialDetalle}>Te mostramos lo principal en el inicio, paso a paso</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.white} />
      </Pressable>

      {/* Hogar de ejemplo: para practicar sin miedo (opcional). */}
      <View style={styles.ejemplo}>
        <Pressable onPress={handleProbarEjemplo} disabled={trabajandoEjemplo} style={styles.ejemploFila} accessibilityRole="button">
          <Ionicons name="flask-outline" size={22} color={colors.primaryDark} />
          <View style={styles.tutorialTextos}>
            <Text style={styles.ejemploTitulo}>{ejemplo ? 'Ir al hogar de ejemplo' : 'Probar con un hogar de ejemplo'}</Text>
            <Text style={styles.ejemploDetalle}>
              {ejemplo ? 'Tu hogar de práctica con productos de muestra' : 'Un hogar con productos de muestra para practicar sin miedo'}
            </Text>
          </View>
          {trabajandoEjemplo ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.primaryDark} />
          )}
        </Pressable>
        {ejemplo && (
          <Pressable onPress={handleBorrarEjemplo} disabled={trabajandoEjemplo} style={styles.ejemploBorrar} accessibilityRole="button">
            <Ionicons name="trash-outline" size={16} color={colors.danger} />
            <Text style={styles.ejemploBorrarTexto}>Borrar el hogar de ejemplo</Text>
          </Pressable>
        )}
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
    tutorial: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    ejemplo: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    ejemploFila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      backgroundColor: colors.primaryLight,
    },
    ejemploTitulo: {
      ...typography.bodyMedium,
      color: colors.primaryDark,
    },
    ejemploDetalle: {
      ...typography.caption,
      color: colors.primaryDark,
    },
    ejemploBorrar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    ejemploBorrarTexto: {
      ...typography.caption,
      color: colors.danger,
    },
    tutorialTextos: {
      flex: 1,
      gap: 2,
    },
    tutorialTitulo: {
      ...typography.bodyMedium,
      color: colors.white,
    },
    tutorialDetalle: {
      ...typography.caption,
      color: colors.white,
      opacity: 0.85,
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
