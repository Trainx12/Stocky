/**
 * Rutas del stack de autenticación (usuario sin sesión) y del stack
 * principal (usuario logueado). Se dividen en dos objetos para que
 * RootNavigator pueda renderizar uno u otro según haya sesión, sin mezclar
 * pantallas de un flujo con el otro en un único param list gigante.
 */
// `undefined` = la pantalla no recibe parámetros de navegación.
export type AuthStackParamList = {
  Welcome: undefined;
  Onboarding: undefined;
  Login: undefined;
};

export type AppStackParamList = {
  Home: undefined;
  // RF7: listado/ABM de productos de UN hogar puntual. Va por parámetro de
  // navegación (no por contexto global) porque un usuario puede tener más
  // de un hogar (RF6) y cada uno tiene su propio inventario.
  // `abrirAgregar`: si viene en true, ProductosScreen abre el modal de
  // "Agregar producto" apenas monta (usado por el acceso rápido "Agregar
  // producto" de HomeScreen, para no obligar a un segundo toque en el FAB).
  Productos: { hogarId: string; hogarNombre: string; abrirAgregar?: boolean };
};
