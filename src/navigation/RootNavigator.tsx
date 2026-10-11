import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProductosScreen } from '../screens/ProductosScreen';
import { AdminSugerenciasScreen } from '../screens/AdminSugerenciasScreen';
import { AdminUsuariosScreen } from '../screens/AdminUsuariosScreen';
import { CuentaDeshabilitadaScreen } from '../screens/CuentaDeshabilitadaScreen';
import { NotificacionesScreen } from '../screens/NotificacionesScreen';
import { TerminosPrevioScreen, TerminosVerScreen, TerminosVista } from '../screens/TerminosScreen';
import { aceptarTerminos, necesitaAceptarTerminos, registrarAceptacionPendiente } from '../services/terminos';
import { navegacion } from './navegacion';
import { colors } from '../theme';
import type { AppStackParamList, AuthStackParamList } from '../types/navigation';

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

// Pantallas que ve alguien sin sesión iniciada.
function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="Onboarding" component={OnboardingScreen} />
      <AuthStack.Screen name="Terminos" component={TerminosPrevioScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
}

// Pantallas para alguien ya logueado.
function AppNavigator() {
  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      <AppStack.Screen name="Home" component={HomeScreen} />
      <AppStack.Screen name="Productos" component={ProductosScreen} />
      {/* Sin gateo de rol acá a propósito: RootNavigator no mira el rol
          todavía (ver su propio comentario abajo) -- el gateo real es la
          RLS del lado del servidor (nadie que no sea admin ve ninguna
          sugerencia pendiente ajena) + que HomeScreen ni siquiera ofrece
          el botón para entrar acá si el usuario no es admin. */}
      <AppStack.Screen name="AdminSugerencias" component={AdminSugerenciasScreen} />
      {/* Mismo criterio que AdminSugerencias: HomeScreen solo ofrece el
          acceso a admins, y si alguien fuerza la navegación la RPC
          admin_listar_usuarios le devuelve error (no hay datos que ver). */}
      <AppStack.Screen name="AdminUsuarios" component={AdminUsuariosScreen} />
      {/* Campanita: notificaciones del propio usuario (cualquier rol). */}
      <AppStack.Screen name="Notificaciones" component={NotificacionesScreen} />
      {/* Términos y Condiciones de solo lectura (enlace en Home). */}
      <AppStack.Screen name="Terminos" component={TerminosVerScreen} />
    </AppStack.Navigator>
  );
}

/**
 * Punto de decisión entre el stack de autenticación y el stack principal.
 * No hay lógica de roles acá todavía (RF9/RF10 son sprint 9): cualquier
 * usuario con sesión válida entra al stack principal, sin importar su rol.
 */
export function RootNavigator() {
  const { session, loading, usuario, refreshUsuario } = useAuth();
  const faltanTerminos = session !== null && necesitaAceptarTerminos(usuario);
  // true mientras se intenta registrar una aceptación hecha antes del login
  // (en ese caso no hay que volver a mostrar los términos).
  const [registrandoPendiente, setRegistrandoPendiente] = useState(false);

  // Si la cuenta no aceptó la versión vigente pero en este celular se
  // aceptó antes de loguearse (después del onboarding), se registra solo.
  useEffect(() => {
    if (!faltanTerminos) return;
    let cancelado = false;
    setRegistrandoPendiente(true);
    registrarAceptacionPendiente().then(async (registrado) => {
      if (registrado) await refreshUsuario();
      if (!cancelado) setRegistrandoPendiente(false);
    });
    return () => {
      cancelado = true;
    };
  }, [faltanTerminos]);

  // Todavía no sabemos si hay sesión guardada o no: mostramos un spinner
  // en vez de "parpadear" entre Welcome y Home mientras se resuelve.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Cuenta deshabilitada por un admin: ni siquiera se arma el stack
  // principal (ver CuentaDeshabilitadaScreen). Se compara contra `false`
  // explícito: mientras el perfil carga (`usuario` null) no se asume nada.
  if (session && usuario?.habilitado === false) {
    return <CuentaDeshabilitadaScreen />;
  }

  // Logueado sin haber aceptado la versión vigente de los Términos (cuentas
  // anteriores a los términos, o una versión nueva): no se entra a la app
  // hasta aceptarlos. Ver services/terminos.ts.
  if (faltanTerminos) {
    if (registrandoPendiente) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      );
    }
    return (
      <TerminosVista
        modo="aceptar"
        onAceptar={async () => {
          await aceptarTerminos();
          await refreshUsuario();
        }}
      />
    );
  }

  // Con o sin sesión, se muestra un stack completo distinto.
  // `navegacion` (ver navegacion.ts) permite navegar desde fuera de una
  // pantalla, por ejemplo al tocar una notificación del sistema.
  return (
    <NavigationContainer ref={navegacion}>{session ? <AppNavigator /> : <AuthNavigator />}</NavigationContainer>
  );
}
