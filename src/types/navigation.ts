/**
 * Rutas del stack de autenticación (usuario sin sesión) y del stack
 * principal (usuario logueado). Se dividen en dos objetos para que
 * RootNavigator pueda renderizar uno u otro según haya sesión, sin mezclar
 * pantallas de un flujo con el otro en un único param list gigante.
 */
export type AuthStackParamList = {
  Welcome: undefined;
  Onboarding: undefined;
  Login: undefined;
};

export type AppStackParamList = {
  Home: undefined;
};
