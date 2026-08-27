# Incidentes y soluciones — Sprint 3

Registro de los problemas no triviales encontrados mientras se agregaba
edición/salida de hogar desde `HomeScreen` (además de desde "Administrar Mis
Hogares"). Mismo espíritu que
[docs/incidentes-sprint1.md](incidentes-sprint1.md) y
[docs/incidentes-sprint2.md](incidentes-sprint2.md): que si un error
parecido vuelve a aparecer, no haya que redescubrirlo de cero.

---

## 1. `Alert.alert(...)` con botones no hace nada en la versión web

**Síntoma:** el botón "Salir" de un hogar (y cualquier otro `Alert.alert`
con más de un botón) no producía ningún efecto visible al tocarlo en
`npx expo start --web` — ni se mostraba un diálogo de confirmación ni se
disparaba la acción. En Expo Go / development build (nativo) sí funcionaba
bien.

**Causa raíz:** la implementación de `Alert` de `react-native-web` (el
paquete que permite correr la app en el navegador) es un stub vacío:

```js
// node_modules/react-native-web/dist/exports/Alert/index.js
class Alert {
  static alert() {}
}
```

Es decir, en web `Alert.alert(titulo, mensaje, botones)` no muestra nada
ni ejecuta ningún `onPress` de los botones — la llamada simplemente no
hace nada. Como el flujo de "salir de un hogar" dependía de que el usuario
tocara el botón "Salir" dentro de ese `Alert`, en web el flujo entero
quedaba roto en silencio (sin error en consola, porque técnicamente no
falla nada: la función se ejecuta y no lanza excepción).

Esto no es un bug nuevo de esta funcionalidad: ya estaba presente desde
que existe la app (todo uso de `Alert.alert`, incluido el de error de
login en `LoginScreen`), solo que recién se notó ahora porque "salir del
hogar" es la primera acción **destructiva con confirmación** (más de un
botón) que se probó a fondo en web.

**Solución:** se agregó [`src/lib/alert.ts`](../src/lib/alert.ts) con dos
helpers cross-platform:

- `avisar(titulo, mensaje)`: mensaje de un solo botón (errores/avisos). En
  nativo usa `Alert.alert` real; en web usa `window.alert`.
- `confirmar(titulo, mensaje, confirmLabel?)`: confirmación sí/no, devuelve
  una `Promise<boolean>` (en vez de un callback) para poder hacer `await`
  en el caller. En nativo envuelve `Alert.alert` con dos botones; en web
  usa `window.confirm`.

Se reemplazaron todos los usos de `Alert.alert` en
`HomeScreen.tsx`, `ManageHomesListModal.tsx` y `LoginScreen.tsx` por estos
helpers.

**Cómo evitar que vuelva a pasar:** no importar `Alert` de `react-native`
directo en pantallas/componentes nuevos — usar `avisar()`/`confirmar()` de
`src/lib/alert.ts`, y si hace falta un caso que esos dos no cubren,
sumarlo ahí (no reintroducir `Alert.alert` suelto).

---

## Estado actual (para referencia rápida)

- `src/lib/alert.ts` es el único lugar del código que debería importar
  `Alert` de `react-native` para mostrar diálogos al usuario.
- Verificado por Claude: tests unitarios de `avisar`/`confirmar`
  (`src/lib/alert.test.ts`, cubren la rama web con `window.alert`/
  `window.confirm` mockeados y la rama nativa con `Alert.alert`
  mockeado), `tsc --noEmit` limpio, y que la app sigue bundleando y
  renderizando sin errores en `expo start --web`.
- **Pendiente de un humano:** probar el click real en el navegador (el
  botón "Salir" pide confirmación con `window.confirm` y de verdad saca
  al usuario del hogar) y en un dispositivo/dev client real — esto
  requiere loguearse con una cuenta de Google real, que Claude no puede
  hacer por sí solo.
