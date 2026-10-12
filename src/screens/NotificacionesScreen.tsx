import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import { useNotificaciones } from '../context/NotificacionesContext';
import {
  aparienciaNotificacion,
  destinoNotificacion,
  eliminarNotificacion,
  guardarDiasAvisoGeneral,
  listarNotificaciones,
  marcarLeidas,
  marcarTodasLeidas,
  tiempoRelativo,
} from '../services/notificaciones';
import type { FamiliaNotificacion } from '../services/notificaciones';
import { listarMisHogares } from '../services/hogares';
import { guardarAlertasDeTodos, leerAlertasDeTodos } from '../services/preferenciasHogar';
import { ajustarDiasAviso, DIAS_AVISO_MAXIMO, DIAS_AVISO_MINIMO, DIAS_AVISO_POR_DEFECTO } from '../services/productos';
import type { Notificacion } from '../types/database';
import { avisar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'Notificaciones'>;

// Color del ícono y de su círculo de fondo para cada familia de
// notificación (mismos colores que los badges: vencimientos coral, stock
// ámbar, buenas noticias verde).
// Función (no constante): se lee en cada render, así respeta el modo claro/oscuro.
const coloresPorFamilia = (): Record<FamiliaNotificacion, { color: string; fondo: string }> => ({
  vencimiento: { color: colors.stockStatus.critical, fondo: colors.dangerLight },
  stock: { color: colors.textPrimary, fondo: colors.warningLight },
  exito: { color: colors.success, fondo: colors.successLight },
  aviso: { color: colors.textSecondary, fondo: colors.background },
  hogar: { color: colors.primary, fondo: colors.primaryLight },
});

/**
 * Campanita (Sprint 10): notificaciones recientes del usuario, nuevas
 * primero, y arriba las preferencias de aviso:
 *   - "Avisarme X días antes de que venza" (general; cada producto puede
 *     tener el suyo en su formulario, que tiene prioridad);
 *   - "Alertas de todos mis hogares": si "Productos próximos a vencer" y
 *     "Stock bajo" del inicio muestran solo el hogar que se está usando (por
 *     defecto) o todos (services/preferenciasHogar.ts);
 *   - estado de las notificaciones en el teléfono, con un botón para
 *     activarlas si todavía no se dio el permiso.
 * Tocar una notificación la marca como leída y lleva a donde corresponde
 * (despensa con el filtro, "Miembros del hogar", Home, sugerencias).
 */
export function NotificacionesScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const { usuario, refreshUsuario } = useAuth();
  const { refrescarNoLeidas, pushActivo, activarEnTelefono, suscribirseANuevas } = useNotificaciones();
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState(usuario?.dias_aviso_vencimiento ?? DIAS_AVISO_POR_DEFECTO);
  const [guardandoDias, setGuardandoDias] = useState(false);
  // Opción "Alertas de todos mis hogares" (por defecto apagada).
  const [alertasDeTodos, setAlertasDeTodos] = useState(false);

  useEffect(() => {
    if (usuario?.id) leerAlertasDeTodos(usuario.id).then(setAlertasDeTodos);
  }, [usuario?.id]);

  async function handleCambiarAlertasDeTodos(todos: boolean) {
    if (!usuario?.id) return;
    setAlertasDeTodos(todos);
    try {
      await guardarAlertasDeTodos(usuario.id, todos);
    } catch (err) {
      setAlertasDeTodos(!todos);
      avisar('Error', err instanceof Error ? err.message : 'No se pudo guardar la preferencia.');
    }
  }

  const cargar = useCallback(async () => {
    try {
      setNotificaciones(await listarNotificaciones());
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron cargar las notificaciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Si llega una nueva con la pantalla abierta, aparece arriba de la lista.
  useEffect(() => suscribirseANuevas(() => cargar()), [suscribirseANuevas, cargar]);

  // Si la preferencia cambia desde otro lado (otro celular), se refleja.
  useEffect(() => {
    if (usuario?.dias_aviso_vencimiento) setDias(usuario.dias_aviso_vencimiento);
  }, [usuario?.dias_aviso_vencimiento]);

  async function handleTocar(n: Notificacion) {
    if (!n.leida) {
      setNotificaciones((actuales) => actuales.map((x) => (x.id === n.id ? { ...x, leida: true } : x)));
      marcarLeidas([n.id])
        .then(refrescarNoLeidas)
        .catch((err) => console.warn('[Stocky] No se pudo marcar como leída:', err));
    }

    const destino = destinoNotificacion(n);
    if (!destino) return;
    if (destino.pantalla === 'inicio') {
      navigation.navigate('Home');
    } else if (destino.pantalla === 'sugerencias') {
      navigation.navigate('AdminSugerencias');
    } else if (destino.pantalla === 'miembros') {
      navigation.navigate('Home', { abrirMiembrosDe: destino.hogarId });
    } else {
      // La despensa necesita el nombre del hogar; si ya no soy miembro, aviso.
      const hogar = (await listarMisHogares()).find((h) => h.id === destino.hogarId);
      if (!hogar) {
        avisar('Sin acceso', 'Ya no formás parte de ese hogar.', 'info');
        return;
      }
      navigation.navigate('Productos', { hogarId: hogar.id, hogarNombre: hogar.nombre, filtroInicial: destino.filtro });
    }
  }

  async function handleMarcarTodas() {
    setNotificaciones((actuales) => actuales.map((x) => ({ ...x, leida: true })));
    try {
      await marcarTodasLeidas();
      await refrescarNoLeidas();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudieron marcar como leídas.');
      cargar();
    }
  }

  async function handleEliminar(n: Notificacion) {
    setNotificaciones((actuales) => actuales.filter((x) => x.id !== n.id));
    try {
      await eliminarNotificacion(n.id);
      if (!n.leida) await refrescarNoLeidas();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo borrar la notificación.');
      cargar();
    }
  }

  // Cambia los días con los botones − / + y guarda al toque (sin botón
  // "Guardar" aparte: es una preferencia, no un formulario).
  async function handleCambiarDias(delta: number) {
    const nuevo = ajustarDiasAviso(dias, delta);
    if (nuevo === dias) return;
    const anterior = dias;
    setDias(nuevo);
    setGuardandoDias(true);
    try {
      await guardarDiasAvisoGeneral(nuevo);
      await refreshUsuario();
    } catch (err) {
      setDias(anterior);
      avisar('Error', err instanceof Error ? err.message : 'No se pudo guardar la preferencia.');
    } finally {
      setGuardandoDias(false);
    }
  }

  async function handleActivarTelefono() {
    const concedido = await activarEnTelefono();
    if (concedido) {
      avisar('Notificaciones activadas', 'Te vamos a avisar en el teléfono.', 'exito');
    } else {
      avisar(
        'Permiso denegado',
        'Para recibir avisos en el teléfono, habilitá las notificaciones de Stocky en la configuración del celular.',
        'info',
      );
    }
  }

  const hayNoLeidas = notificaciones.some((n) => !n.leida);
  const esWeb = Platform.OS === 'web';

  return (
    <ScreenContainer style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Volver">
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.title}>Notificaciones</Text>
        {hayNoLeidas && (
          <Pressable onPress={handleMarcarTodas} accessibilityRole="button" style={styles.marcarTodas}>
            <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
            <Text style={styles.marcarTodasTexto}>Leídas</Text>
          </Pressable>
        )}
      </View>

      <ScrollView style={styles.lista} contentContainerStyle={styles.listaContenido} showsVerticalScrollIndicator={false}>
        {/* Preferencias de aviso */}
        <View style={styles.preferencias}>
          <View style={styles.preferenciaFila}>
            <View style={styles.preferenciaTextos}>
              <Text style={styles.preferenciaTitulo}>Avisarme antes de que venza</Text>
              <Text style={styles.preferenciaDetalle}>
                Para todos los productos. Podés elegir otro número para un producto puntual en su formulario.
              </Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => handleCambiarDias(-1)}
                disabled={guardandoDias || dias <= DIAS_AVISO_MINIMO}
                accessibilityRole="button"
                accessibilityLabel="Un día menos"
              >
                <Ionicons name="remove-circle-outline" size={28} color={dias <= DIAS_AVISO_MINIMO ? colors.border : colors.primary} />
              </Pressable>
              <Text style={styles.stepperValor}>{dias === 1 ? '1 día' : `${dias} días`}</Text>
              <Pressable
                onPress={() => handleCambiarDias(1)}
                disabled={guardandoDias || dias >= DIAS_AVISO_MAXIMO}
                accessibilityRole="button"
                accessibilityLabel="Un día más"
              >
                <Ionicons name="add-circle-outline" size={28} color={dias >= DIAS_AVISO_MAXIMO ? colors.border : colors.primary} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.preferenciaFila, styles.preferenciaSeparada]}>
            <View style={styles.preferenciaTextos}>
              <Text style={styles.preferenciaTitulo}>Alertas de todos mis hogares</Text>
              <Text style={styles.preferenciaDetalle}>
                {alertasDeTodos
                  ? 'En el inicio ves lo próximo a vencer y el stock bajo de todos tus hogares.'
                  : 'En el inicio ves lo próximo a vencer y el stock bajo solo del hogar que estás usando.'}
              </Text>
            </View>
            <Switch
              value={alertasDeTodos}
              onValueChange={handleCambiarAlertasDeTodos}
              trackColor={{ true: colors.primary, false: colors.border }}
              thumbColor={colors.white}
              accessibilityLabel="Alertas de todos mis hogares"
            />
          </View>

          <View style={[styles.preferenciaFila, styles.preferenciaSeparada]}>
            <Ionicons
              name={esWeb ? 'phone-portrait-outline' : pushActivo ? 'notifications' : 'notifications-off-outline'}
              size={22}
              color={pushActivo ? colors.success : colors.textSecondary}
            />
            <View style={styles.preferenciaTextos}>
              <Text style={styles.preferenciaTitulo}>Avisos en el teléfono</Text>
              <Text style={styles.preferenciaDetalle}>
                {esWeb
                  ? 'Disponibles en la app del celular.'
                  : pushActivo
                    ? 'Activados: te llegan aunque la app esté cerrada.'
                    : 'Sin activar del todo: tocá "Activar" para recibir avisos con la app cerrada.'}
              </Text>
            </View>
            {!esWeb && !pushActivo && (
              <Pressable onPress={handleActivarTelefono} style={styles.activarBoton} accessibilityRole="button">
                <Text style={styles.activarTexto}>Activar</Text>
              </Pressable>
            )}
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : notificaciones.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="notifications-outline" size={36} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No tenés notificaciones todavía.</Text>
            <Text style={styles.emptyDetalle}>
              Te avisamos acá cuando alguien quiera unirse a tu hogar, te acepten en uno, se esté por vencer algo o
              te quede poco de un producto.
            </Text>
          </View>
        ) : (
          notificaciones.map((n) => {
            const { icono, familia } = aparienciaNotificacion(n.tipo);
            const color = coloresPorFamilia()[familia];
            return (
              <Pressable
                key={n.id}
                onPress={() => handleTocar(n)}
                style={[styles.fila, !n.leida && styles.filaNoLeida]}
                accessibilityRole="button"
                accessibilityLabel={`${n.leida ? '' : 'Sin leer. '}${n.titulo}. ${n.mensaje}`}
              >
                <View style={[styles.iconoCirculo, { backgroundColor: color.fondo }]}>
                  <Ionicons name={icono as keyof typeof Ionicons.glyphMap} size={20} color={color.color} />
                </View>
                <View style={styles.filaTextos}>
                  <Text style={[styles.filaTitulo, !n.leida && styles.filaTituloNoLeida]} numberOfLines={1}>
                    {n.titulo}
                  </Text>
                  <Text style={styles.filaMensaje} numberOfLines={3}>
                    {n.mensaje}
                  </Text>
                  <Text style={styles.filaTiempo}>{tiempoRelativo(n.created_at)}</Text>
                </View>
                <View style={styles.filaDerecha}>
                  {!n.leida && <View style={styles.puntoNoLeida} />}
                  <Pressable
                    onPress={() => handleEliminar(n)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Borrar notificación ${n.titulo}`}
                  >
                    <Ionicons name="close" size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </Pressable>
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
    flex: 1,
  },
  marcarTodas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: spacing.xs,
  },
  marcarTodasTexto: {
    ...typography.caption,
    color: colors.primary,
  },
  lista: {
    flex: 1,
  },
  listaContenido: {
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  preferencias: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  preferenciaFila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preferenciaSeparada: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  preferenciaTextos: {
    flex: 1,
    gap: 2,
  },
  preferenciaTitulo: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  preferenciaDetalle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  stepperValor: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    minWidth: 56,
    textAlign: 'center',
  },
  activarBoton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  activarTexto: {
    ...typography.caption,
    color: colors.white,
  },
  loader: {
    marginTop: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyDetalle: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Sin leer: fondo violeta muy claro y borde violeta, para encontrarlas de
  // un vistazo.
  filaNoLeida: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  iconoCirculo: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filaTextos: {
    flex: 1,
    gap: 2,
  },
  filaTitulo: {
    ...typography.bodyMedium,
    color: colors.textPrimary,
  },
  filaTituloNoLeida: {
    color: colors.primaryDark,
  },
  filaMensaje: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  filaTiempo: {
    ...typography.caption,
    fontSize: 11,
    color: colors.textSecondary,
  },
  filaDerecha: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  puntoNoLeida: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
