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
import { NotificacionesProvider } from './src/context/NotificacionesContext';
import { AvisosHost } from './src/components/AvisosHost';
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
  // la app. NotificacionesProvider: campanita, cartelitos en tiempo real y
  // avisos en el teléfono (necesita la sesión, por eso va adentro).
  // RootNavigator: decide qué pantallas mostrar (ver sección 7 de
  // docs/arquitectura-del-codigo.md). AvisosHost va último para quedar por
  // encima de cualquier pantalla: muestra los cartelitos de avisar() y los
  // diálogos de confirmar() (ver src/lib/alert.ts).
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificacionesProvider>
          <RootNavigator />
          <AvisosHost />
          <StatusBar style="dark" />
        </NotificacionesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
