import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { WelcomeScreen } from '../screens/WelcomeScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ProductosScreen } from '../screens/ProductosScreen';
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
    </AppStack.Navigator>
  );
}

/**
 * Punto de decisión entre el stack de autenticación y el stack principal.
 * No hay lógica de roles acá todavía (RF9/RF10 son sprint 9): cualquier
 * usuario con sesión válida entra al stack principal, sin importar su rol.
 */
export function RootNavigator() {
  const { session, loading } = useAuth();

  // Todavía no sabemos si hay sesión guardada o no: mostramos un spinner
  // en vez de "parpadear" entre Welcome y Home mientras se resuelve.
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Con o sin sesión, se muestra un stack completo distinto.
  return <NavigationContainer>{session ? <AppNavigator /> : <AuthNavigator />}</NavigationContainer>;
}
