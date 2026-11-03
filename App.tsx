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
import { TemaProvider, useTema } from './src/context/TemaContext';
import { NotificacionesProvider } from './src/context/NotificacionesContext';
import { AvisosHost } from './src/components/AvisosHost';
import { CelebracionHost } from './src/components/CelebracionHost';
import { RedDeSeguridad } from './src/components/RedDeSeguridad';
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
  // TemaProvider va por fuera de todo: el modo claro/oscuro (ver
  // context/TemaContext.tsx) tiene que estar aplicado antes de que cualquier
  // pantalla arme sus estilos.
  return (
    <SafeAreaProvider>
      <TemaProvider>
        <AuthProvider>
          <NotificacionesProvider>
            {/* Si una pantalla falla al dibujarse, aviso + "Reintentar" en vez de pantalla vacía. */}
            <RedDeSeguridad>
              <RootNavigator />
            </RedDeSeguridad>
            <CelebracionHost />
            <AvisosHost />
            <BarraDeEstado />
          </NotificacionesProvider>
        </AuthProvider>
      </TemaProvider>
    </SafeAreaProvider>
  );
}

// Íconos de la barra de estado (hora, batería) oscuros sobre fondo claro y
// claros sobre fondo oscuro.
function BarraDeEstado() {
  const { esquema } = useTema();
  return <StatusBar style={esquema === 'oscuro' ? 'light' : 'dark'} />;
}
