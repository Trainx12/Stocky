import 'react-native-gesture-handler';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts as usePoppinsFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { useFonts as useBalooFonts, Baloo2_500Medium, Baloo2_700Bold } from '@expo-google-fonts/baloo-2';
import { AuthProvider } from './src/context/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { colors } from './src/theme';

export default function App() {
  // Carga las fuentes que usa src/theme/typography.ts. Hasta que terminen
  // de cargar, no se muestra ninguna pantalla (evita ver texto con la
  // fuente del sistema por una fracción de segundo).
  const [poppinsLoaded] = usePoppinsFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const [balooLoaded] = useBalooFonts({ Baloo2_500Medium, Baloo2_700Bold });

  if (!poppinsLoaded || !balooLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // SafeAreaProvider: necesario para que ScreenContainer sepa dónde están
  // los bordes seguros. AuthProvider: sesión/usuario disponibles para toda
  // la app. RootNavigator: decide qué pantallas mostrar (ver sección 7 de
  // docs/arquitectura-del-codigo.md).
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="dark" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
