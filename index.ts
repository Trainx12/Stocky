import { registerRootComponent } from 'expo';

import App from './App';

// Punto de entrada de Expo: registerRootComponent registra App como el
// componente principal ('main') y prepara el entorno igual para el
// development build de expo.dev (como prueba el equipo), un build de
// producción o la web.
registerRootComponent(App);
