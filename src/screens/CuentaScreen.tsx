import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { BottomNavBar } from '../components/BottomNavBar';
import type { TabKey } from '../components/BottomNavBar';
import { useAuth } from '../context/AuthContext';
import { useNotificaciones } from '../context/NotificacionesContext';
import { useTema } from '../context/TemaContext';
import type { ModoTema } from '../context/TemaContext';
import { cerrarTodasLasSesiones, eliminarMiCuenta, signInWithGoogle, signOut } from '../services/auth';
import { ComentarioModal } from '../components/ComentarioModal';
import { Avatar } from '../components/Avatar';
import { FotoAmpliadaModal } from '../components/FotoAmpliadaModal';
import { esCuentaProtegida } from '../services/admin';
import { cambiarACuenta, listarCuentas } from '../services/cuentas';
import type { ResumenCuenta } from '../services/cuentas';
import { actualizarMiNombre, inicialDe, LARGO_MAXIMO_NOMBRE } from '../services/usuarios';
import { ANCHO_AVATAR, cambiarMiAvatar, quitarMiAvatar } from '../services/avatar';
import { obtenerFotoBase64 } from '../lib/fotos';
import type { OrigenFoto } from '../lib/fotos';
import { avisar, confirmar } from '../lib/alert';
import { colors, radius, spacing, typography } from '../theme';
import { useEstilos } from '../theme/useEstilos';
import type { AppStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<AppStackParamList, 'Cuenta'>;

// "Sistema" primero: es el modo por defecto (ver MODO_POR_DEFECTO en TemaContext).
const MODOS: { valor: ModoTema; etiqueta: string; icono: keyof typeof Ionicons.glyphMap }[] = [
  { valor: 'sistema', etiqueta: 'Sistema', icono: 'phone-portrait-outline' },
  { valor: 'claro', etiqueta: 'Claro', icono: 'sunny-outline' },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: 'moon-outline' },
];

/**
 * Cuenta y configuración (botón de la persona en la barra de abajo,
 * Sprint 10). Reúne todo lo de la cuenta en un solo lugar:
 *   - Perfil: foto (galería, cámara o archivo en la web), nombre
 *     (editable), email y rol.
 *   - Cuentas: varias cuentas en el mismo celular, como Instagram; tocar
 *     otra cambia a ella sin volver a pasar por Google (services/cuentas.ts).
 *   - Apariencia: modo claro / oscuro / el del sistema (TemaContext).
 *   - Notificaciones: lleva a la campanita, donde están las preferencias.
 *   - Legal: Términos y Condiciones (con los créditos) y versión de la app.
 *   - Cerrar sesión (de esta cuenta, o de todas).
 */
export function CuentaScreen({ navigation }: Props) {
  const styles = useEstilos(crearEstilos);
  const { usuario, session, refreshUsuario } = useAuth();
  const { noLeidas } = useNotificaciones();
  const { modo, cambiarModo } = useTema();
  const [cuentas, setCuentas] = useState<ResumenCuenta[]>([]);
  // userId de la cuenta a la que se está cambiando (spinner en esa fila).
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardandoNombre, setGuardandoNombre] = useState(false);
  const [comentarioVisible, setComentarioVisible] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [fotoAmpliada, setFotoAmpliada] = useState(false);

  const userIdActual = session?.user.id;
  const email = usuario?.email ?? session?.user.email ?? '';

  // La lista de cuentas se relee cada vez que se entra a la pantalla.
  useFocusEffect(
    useCallback(() => {
      listarCuentas()
        .then(setCuentas)
        .catch((err) => console.warn('[Stocky] No se pudieron leer las cuentas guardadas:', err));
    }, [userIdActual]),
  );

  async function handleCambiarCuenta(cuenta: ResumenCuenta) {
    if (cuenta.userId === userIdActual) return;
    setCambiando(cuenta.userId);
    try {
      await cambiarACuenta(cuenta.userId);
      // AuthContext detecta la sesión nueva y toda la app pasa a esa cuenta.
      avisar('Listo', `Ahora estás usando ${cuenta.nombre ?? cuenta.email}.`, 'exito');
      navigation.navigate('Home');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cambiar de cuenta.');
      setCuentas(await listarCuentas());
    } finally {
      setCambiando(null);
    }
  }

  // Agregar otra cuenta: login con Google eligiendo la cuenta. La actual
  // queda guardada para volver a ella.
  async function handleAgregarCuenta() {
    setAgregando(true);
    try {
      const sesion = await signInWithGoogle();
      // En la web la página se va a Google y vuelve sola: no hay nada que
      // avisar todavía.
      if (!sesion) return;
      avisar('Cuenta agregada', 'Podés cambiar entre tus cuentas desde acá.', 'exito');
      navigation.navigate('Home');
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : '';
      // Cancelar el login no es un error para mostrar.
      if (!/cancelado/i.test(mensaje)) avisar('No se pudo agregar la cuenta', mensaje || 'Intentá de nuevo.');
    } finally {
      setAgregando(false);
    }
  }

  async function handleGuardarNombre() {
    setGuardandoNombre(true);
    try {
      await actualizarMiNombre(nombre);
      await refreshUsuario();
      setEditandoNombre(false);
      avisar('Nombre actualizado', 'Así te van a ver en tus hogares.', 'exito');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo guardar el nombre.');
    } finally {
      setGuardandoNombre(false);
    }
  }

  // Foto de perfil: se elige, se achica (lib/fotos.ts) y se sube enseguida
  // (services/avatar.ts). La vieja se borra sola.
  async function handleElegirFoto(origen: OrigenFoto) {
    if (!usuario) return;
    setCargandoFoto(true);
    try {
      const foto = await obtenerFotoBase64(origen, ANCHO_AVATAR);
      if (!foto) return;
      await cambiarMiAvatar(usuario, foto);
      await refreshUsuario();
      avisar('Foto actualizada', 'Así te van a ver en tus hogares.', 'exito');
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cambiar la foto.');
    } finally {
      setCargandoFoto(false);
    }
  }

  async function handleQuitarFoto() {
    if (!usuario) return;
    const confirmado = await confirmar('Quitar foto', 'Vas a volver a mostrarte con la inicial de tu nombre.', 'Quitar foto');
    if (!confirmado) return;
    setCargandoFoto(true);
    try {
      await quitarMiAvatar(usuario);
      await refreshUsuario();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo quitar la foto.');
    } finally {
      setCargandoFoto(false);
    }
  }

  async function handleCerrarSesion() {
    const otras = cuentas.filter((c) => c.userId !== userIdActual).length;
    const confirmado = await confirmar(
      'Cerrar sesión',
      otras > 0
        ? `Vas a salir de ${email} en este celular y pasar a tu otra cuenta.`
        : `Vas a salir de ${email} en este celular.`,
      'Cerrar sesión',
    );
    if (!confirmado) return;
    try {
      await signOut();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cerrar la sesión.');
    }
  }

  async function handleCerrarTodas() {
    const confirmado = await confirmar(
      'Cerrar sesión en todas',
      `Vas a salir de las ${cuentas.length} cuentas guardadas en este celular.`,
      'Cerrar sesión',
    );
    if (!confirmado) return;
    try {
      await cerrarTodasLasSesiones();
    } catch (err) {
      avisar('Error', err instanceof Error ? err.message : 'No se pudo cerrar la sesión.');
    }
  }

  // Borrar la cuenta para siempre (services/auth.eliminarMiCuenta). Dos
  // confirmaciones: es lo único de la app que no tiene vuelta atrás.
  async function handleBorrarCuenta() {
    const primera = await confirmar(
      'Borrar mi cuenta',
      'Se borran tu perfil, tu foto, tus notificaciones y tu lugar en cada hogar. Si sos dueño de un hogar con más personas, ' +
        'pasa a ser dueño el miembro más antiguo; los hogares donde estás solo se borran con todos sus productos.',
      'Continuar',
    );
    if (!primera) return;
    const segunda = await confirmar(
      '¿Seguro?',
      `Esto no se puede deshacer. Se borra la cuenta ${email}.`,
      'Borrar mi cuenta',
    );
    if (!segunda) return;
    setBorrando(true);
    try {
      await eliminarMiCuenta();
      avisar('Cuenta borrada', 'Tu cuenta y tus datos se borraron. ¡Gracias por haber usado Stocky!', 'exito');
    } catch (err) {
      setBorrando(false);
      avisar('Error', err instanceof Error ? err.message : 'No se pudo borrar la cuenta.');
    }
  }

  // Tabs de la barra de abajo: la persona es esta pantalla.
  function handleTabPress(tab: TabKey) {
    if (tab === 'home') navigation.navigate('Home');
    else if (tab === 'notifications') navigation.navigate('Notificaciones');
    else if (tab === 'admin') navigation.navigate('Admin');
    else if (tab === 'search') navigation.navigate('Home', { abrirBuscador: true });
  }

  const otrasCuentas = cuentas.filter((c) => c.userId !== userIdActual);
  const version = Constants.expoConfig?.version ?? '';

  return (
    <ScreenContainer style={styles.container} noPadding>
      <ScrollView style={styles.padded} contentContainerStyle={styles.contenido} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Cuenta</Text>

        {/* Perfil */}
        <View style={styles.tarjeta}>
          <View style={styles.perfil}>
            {/* Tocar la foto la muestra en grande (si hay una). */}
            <Pressable
              onPress={() => setFotoAmpliada(true)}
              disabled={!usuario?.avatar_url}
              accessibilityRole={usuario?.avatar_url ? 'button' : 'image'}
              accessibilityLabel={usuario?.avatar_url ? 'Ver tu foto en grande' : 'Tu foto de perfil'}
            >
              <Avatar url={usuario?.avatar_url} nombre={usuario?.nombre} email={email} tamano={72} variante="fuerte" />
            </Pressable>
            <View style={styles.perfilTextos}>
              {editandoNombre ? (
                <TextInput
                  style={styles.inputNombre}
                  value={nombre}
                  onChangeText={setNombre}
                  maxLength={LARGO_MAXIMO_NOMBRE}
                  autoFocus
                  editable={!guardandoNombre}
                  placeholder="Tu nombre"
                  placeholderTextColor={colors.textSecondary}
                  accessibilityLabel="Tu nombre"
                />
              ) : (
                <Text style={styles.nombre} numberOfLines={1}>
                  {usuario?.nombre ?? 'Sin nombre'}
                </Text>
              )}
              <Text style={styles.detalle} numberOfLines={1}>
                {email}
              </Text>
              {usuario?.rol === 'administrador' && (
                <View style={styles.badgeAdmin}>
                  <Text style={styles.badgeAdminTexto}>Administrador</Text>
                </View>
              )}
            </View>
            {editandoNombre ? (
              <View style={styles.accionesNombre}>
                <Pressable onPress={() => setEditandoNombre(false)} accessibilityRole="button" accessibilityLabel="Cancelar">
                  <Ionicons name="close" size={22} color={colors.textSecondary} />
                </Pressable>
                <Pressable
                  onPress={handleGuardarNombre}
                  disabled={guardandoNombre}
                  accessibilityRole="button"
                  accessibilityLabel="Guardar nombre"
                >
                  {guardandoNombre ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Ionicons name="checkmark" size={22} color={colors.primary} />
                  )}
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setNombre(usuario?.nombre ?? '');
                  setEditandoNombre(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Editar tu nombre"
              >
                <Ionicons name="pencil-outline" size={20} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
          <View style={styles.fotoAcciones}>
            {cargandoFoto ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Pressable
                  onPress={() => handleElegirFoto('galeria')}
                  disabled={!usuario}
                  style={styles.fotoBoton}
                  accessibilityRole="button"
                >
                  <Ionicons name={Platform.OS === 'web' ? 'cloud-upload-outline' : 'images-outline'} size={16} color={colors.primary} />
                  <Text style={styles.fotoBotonTexto}>
                    {Platform.OS === 'web' ? 'Subir foto' : usuario?.avatar_url ? 'Cambiar foto' : 'Elegir foto'}
                  </Text>
                </Pressable>
                {/* En la web "Subir foto" ya deja usar la cámara del celular. */}
                {Platform.OS !== 'web' && (
                  <Pressable
                    onPress={() => handleElegirFoto('camara')}
                    disabled={!usuario}
                    style={styles.fotoBoton}
                    accessibilityRole="button"
                  >
                    <Ionicons name="camera-outline" size={16} color={colors.primary} />
                    <Text style={styles.fotoBotonTexto}>Sacar foto</Text>
                  </Pressable>
                )}
                {!!usuario?.avatar_url && (
                  <Pressable onPress={handleQuitarFoto} style={styles.fotoBoton} accessibilityRole="button">
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={[styles.fotoBotonTexto, styles.textoPeligro]}>Quitar foto</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        </View>

        {/* Varias cuentas */}
        <Text style={styles.seccion}>Tus cuentas</Text>
        <View style={styles.tarjeta}>
          <View style={styles.fila}>
            <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
            <View style={styles.filaTextos}>
              <Text style={styles.filaTitulo} numberOfLines={1}>
                {usuario?.nombre ?? email}
              </Text>
              <Text style={styles.detalle} numberOfLines={1}>
                {email} · en uso
              </Text>
            </View>
          </View>
          {otrasCuentas.map((cuenta) => (
            <Pressable
              key={cuenta.userId}
              onPress={() => handleCambiarCuenta(cuenta)}
              disabled={cambiando !== null}
              style={[styles.fila, styles.filaSeparada]}
              accessibilityRole="button"
              accessibilityLabel={`Cambiar a la cuenta ${cuenta.email}`}
            >
              <View style={styles.avatarChico}>
                <Text style={styles.avatarChicoTexto}>{inicialDe(cuenta.nombre, cuenta.email)}</Text>
              </View>
              <View style={styles.filaTextos}>
                <Text style={styles.filaTitulo} numberOfLines={1}>
                  {cuenta.nombre ?? cuenta.email}
                </Text>
                <Text style={styles.detalle} numberOfLines={1}>
                  {cuenta.email}
                </Text>
              </View>
              {cambiando === cuenta.userId ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.enlace}>Cambiar</Text>
              )}
            </Pressable>
          ))}
          <Pressable
            onPress={handleAgregarCuenta}
            disabled={agregando}
            style={[styles.fila, styles.filaSeparada]}
            accessibilityRole="button"
          >
            {agregando ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Ionicons name="person-add-outline" size={22} color={colors.primary} />
            )}
            <Text style={[styles.filaTitulo, styles.textoPrimario]}>Agregar otra cuenta</Text>
          </Pressable>
        </View>

        {/* Apariencia */}
        <Text style={styles.seccion}>Apariencia</Text>
        <View style={[styles.tarjeta, styles.segmentado]}>
          {MODOS.map(({ valor, etiqueta, icono }) => {
            const activo = modo === valor;
            return (
              <Pressable
                key={valor}
                onPress={() => cambiarModo(valor)}
                style={[styles.opcionModo, activo && styles.opcionModoActiva]}
                accessibilityRole="radio"
                accessibilityState={{ selected: activo }}
              >
                <Ionicons name={icono} size={20} color={activo ? colors.white : colors.textSecondary} />
                <Text style={[styles.opcionModoTexto, activo && styles.opcionModoTextoActivo]}>{etiqueta}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Ajustes y legal */}
        <Text style={styles.seccion}>Ajustes</Text>
        <View style={styles.tarjeta}>
          <FilaEnlace
            icono="notifications-outline"
            titulo="Notificaciones"
            detalle={noLeidas > 0 ? `${noLeidas} sin leer · avisos de vencimiento y del teléfono` : 'Avisos de vencimiento y del teléfono'}
            onPress={() => navigation.navigate('Notificaciones')}
          />
          <FilaEnlace
            icono="help-circle-outline"
            titulo="Ayuda"
            detalle="Cómo hacer lo básico, paso a paso"
            onPress={() => navigation.navigate('Ayuda')}
            separada
          />
          {/* Comentarios que leen los administradores (services/comentarios.ts). */}
          <FilaEnlace
            icono="chatbubble-ellipses-outline"
            titulo="Contanos qué mejorar"
            detalle="Una idea, algo que falló o lo que quieras"
            onPress={() => setComentarioVisible(true)}
            separada
          />
          {/* Repetir el tutorial guiado del inicio (src/tutorial/). */}
          <FilaEnlace
            icono="school-outline"
            titulo="Ver el tutorial"
            detalle="Un recorrido guiado por lo principal"
            onPress={() => navigation.navigate('Home', { verTutorial: true })}
            separada
          />
          <FilaEnlace
            icono="document-text-outline"
            titulo="Términos y Condiciones"
            detalle="Privacidad, uso de la información y créditos"
            onPress={() => navigation.navigate('Terminos')}
            separada
          />
          <View style={[styles.fila, styles.filaSeparada]}>
            <Ionicons name="information-circle-outline" size={22} color={colors.textSecondary} />
            <View style={styles.filaTextos}>
              <Text style={styles.filaTitulo}>Acerca de Stocky</Text>
              <Text style={styles.detalle}>Versión {version} · Tu hogar, siempre organizado</Text>
            </View>
          </View>
        </View>

        {/* Sesión */}
        <View style={styles.tarjeta}>
          <Pressable onPress={handleCerrarSesion} style={styles.fila} accessibilityRole="button">
            <Ionicons name="log-out-outline" size={22} color={colors.danger} />
            <Text style={[styles.filaTitulo, styles.textoPeligro]}>Cerrar sesión</Text>
          </Pressable>
          {cuentas.length > 1 && (
            <Pressable onPress={handleCerrarTodas} style={[styles.fila, styles.filaSeparada]} accessibilityRole="button">
              <Ionicons name="exit-outline" size={22} color={colors.danger} />
              <Text style={[styles.filaTitulo, styles.textoPeligro]}>Cerrar sesión en todas las cuentas</Text>
            </Pressable>
          )}
        </View>

        {/* Borrar la cuenta: aparte y al final, para que no se toque sin
            querer. La cuenta principal del proyecto no se borra desde la app
            (lo frena la base: eliminar_mi_cuenta). */}
        {!esCuentaProtegida(email) && (
        <Pressable
          onPress={handleBorrarCuenta}
          disabled={borrando}
          style={styles.borrarCuenta}
          accessibilityRole="button"
        >
          <Ionicons name="trash-outline" size={18} color={colors.danger} />
          <Text style={[styles.detalle, styles.textoPeligro]}>{borrando ? 'Borrando...' : 'Borrar mi cuenta'}</Text>
        </Pressable>
        )}
      </ScrollView>

      {usuario && (
        <ComentarioModal visible={comentarioVisible} onClose={() => setComentarioVisible(false)} usuarioId={usuario.id} />
      )}

      <FotoAmpliadaModal
        imagen={fotoAmpliada && usuario?.avatar_url ? { uri: usuario.avatar_url } : null}
        titulo={usuario?.nombre ?? email}
        onClose={() => setFotoAmpliada(false)}
      />

      <BottomNavBar active="profile" onTabPress={handleTabPress} notificacionesSinLeer={noLeidas} />
    </ScreenContainer>
  );
}

// Una fila que lleva a otra pantalla: ícono, título, detalle y flecha.
function FilaEnlace({
  icono,
  titulo,
  detalle,
  onPress,
  separada,
}: {
  icono: keyof typeof Ionicons.glyphMap;
  titulo: string;
  detalle: string;
  onPress: () => void;
  separada?: boolean;
}) {
  const styles = useEstilos(crearEstilos);
  return (
    <Pressable onPress={onPress} style={[styles.fila, separada && styles.filaSeparada]} accessibilityRole="button">
      <Ionicons name={icono} size={22} color={colors.textSecondary} />
      <View style={styles.filaTextos}>
        <Text style={styles.filaTitulo}>{titulo}</Text>
        <Text style={styles.detalle}>{detalle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const crearEstilos = () =>
  StyleSheet.create({
  borrarCuenta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
    container: {
      gap: 0,
    },
    padded: {
      paddingHorizontal: spacing.lg,
    },
    contenido: {
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    title: {
      ...typography.h2,
      color: colors.textPrimary,
      marginBottom: spacing.sm,
    },
    seccion: {
      ...typography.caption,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      marginTop: spacing.sm,
    },
    tarjeta: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    perfil: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
    },
    fotoAcciones: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: spacing.sm,
      paddingBottom: spacing.sm,
    },
    fotoBoton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
    },
    fotoBotonTexto: {
      ...typography.caption,
      color: colors.primary,
    },
    perfilTextos: {
      flex: 1,
      gap: 2,
    },
    nombre: {
      ...typography.bodyMedium,
      fontSize: 18,
      color: colors.textPrimary,
    },
    inputNombre: {
      ...typography.bodyMedium,
      color: colors.textPrimary,
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingVertical: 2,
    },
    accionesNombre: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    badgeAdmin: {
      alignSelf: 'flex-start',
      backgroundColor: colors.primaryLight,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 1,
      marginTop: 2,
    },
    badgeAdminTexto: {
      ...typography.caption,
      fontSize: 11,
      lineHeight: 15,
      color: colors.primaryDark,
    },
    fila: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
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
    detalle: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    avatarChico: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primaryLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarChicoTexto: {
      ...typography.bodyMedium,
      color: colors.primaryDark,
    },
    enlace: {
      ...typography.caption,
      color: colors.primary,
    },
    textoPrimario: {
      color: colors.primary,
    },
    textoPeligro: {
      color: colors.danger,
    },
    segmentado: {
      flexDirection: 'row',
      gap: spacing.xs,
      padding: spacing.xs,
    },
    opcionModo: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: spacing.sm,
      borderRadius: radius.md,
    },
    opcionModoActiva: {
      backgroundColor: colors.primary,
    },
    opcionModoTexto: {
      ...typography.caption,
      color: colors.textSecondary,
    },
    opcionModoTextoActivo: {
      color: colors.white,
    },
  });
