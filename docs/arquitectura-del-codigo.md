# Arquitectura del código — guía de lectura

Este documento explica **qué hace cada parte del código y por qué está
armada así**, no solo qué archivos existen (eso ya lo lista el
[README](../README.md)). La idea es que cualquiera del equipo pueda
leer esto y entender el proyecto sin tener que preguntarle a quien lo
escribió.

Se actualiza a medida que se agregan piezas nuevas en cada sprint — si
ves algo acá que ya no coincide con el código, avisá para corregirlo.

---

## 1. La idea general: cliente + Supabase, sin backend propio

Stocky no tiene un servidor propio: la app (React Native/Expo) habla
**directo** con Supabase, que hace de backend completo (base de datos,
autenticación, y en el futuro las Edge Functions para OCR/voz). La
seguridad de "quién puede ver/tocar qué dato" no vive en la app —
vive en la base de datos, en forma de **RLS (Row Level Security)**. Esto
es importante tenerlo claro: la app confía en que Postgres va a
rechazar cualquier consulta que no corresponda, así que ninguna pantalla
necesita "acordarse" de filtrar por hogar a mano.

```
App (Expo)  ──consultas──>  Supabase
   │                          ├─ Auth (login con Google)
   │                          ├─ Postgres (tablas + RLS)
   │                          └─ Edge Functions (OCR, voz — hoy son stubs)
   └─ AsyncStorage (guarda la sesión localmente)
```

---

## 2. `src/theme/` — el sistema de diseño

Todo color, tipografía o espaciado de la app sale de acá. La regla es
simple: **ningún componente debería tener un color o tamaño de fuente
escrito a mano** — siempre importa de `theme`.

- **`colors.ts`**: la paleta del logo (violeta, naranja, verde, rojo), más
  colores neutros (fondo, texto, bordes). Tiene un objeto separado
  `stockStatus` (`ok` / `low` / `critical` / `expired`) que va a usar el
  Sprint 4 para las alertas de stock/vencimiento — es intencional que
  esos colores semánticos estén separados de los colores de marca
  (`secondary`), aunque visualmente se parezcan, para que un badge de
  categoría nunca se confunda con una alerta real.
- **`typography.ts`**: define las familias de fuente (Poppins para texto
  de lectura, Baloo 2 para títulos) y los estilos combinados (`h1`,
  `body`, `button`, etc.) que se usan directo en los `StyleSheet` de las
  pantallas. Los nombres de familia (`Poppins_400Regular`, etc.) tienen
  que coincidir exacto con las claves que se cargan en `App.tsx` con
  `useFonts` — si cambia algo acá, hay que revisar `App.tsx` también.
- **`spacing.ts`**: escala de espaciado en base 4 (`xs`=4, `sm`=8, ...) y
  radios de borde. Evita los "números mágicos" tipo `marginTop: 13`.
- **`index.ts`**: junta todo en un solo objeto `theme` para importar
  fácil (`import { theme } from '../theme'` o los exports sueltos como
  `colors`, `spacing`).

---

## 3. `src/types/` — el "contrato" de datos

- **`database.ts`**: tipos de TypeScript que son un espejo de las tablas
  SQL (`Hogar`, `Usuario`, `Producto`, `RolUsuario`). Si se agrega una
  columna en una migración, hay que actualizar el tipo acá también —
  no se generan automáticamente (todavía). También define `Database`,
  que se le pasa a `createClient<Database>()` en `lib/supabase.ts` para
  tener autocompletado y chequeo de tipos en las queries.
- **`navigation.ts`**: los `ParamList` de React Navigation
  (`AuthStackParamList`, `AppStackParamList`). Separar el stack de auth
  del stack "logueado" en dos tipos distintos evita mezclar pantallas de
  un flujo con el otro por error.
- **`index.ts`**: barrel file, re-exporta todo lo de arriba.

---

## 4. `src/lib/supabase.ts` — el cliente de Supabase

Un solo archivo, un solo `export const supabase`. Puntos clave:

- Lee `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY` del
  `.env`. El prefijo `EXPO_PUBLIC_` es lo que hace que Expo las incluya
  en el bundle del cliente — **son públicas a propósito**, la seguridad
  real está en las policies de RLS, no en ocultar esta key.
- Si faltan esas variables, **no rompe la app entera** (no hace
  `throw`): avisa por consola y usa una URL "placeholder" válida. Así,
  alguien que clona el repo sin haber configurado su `.env` todavía
  puede seguir viendo las pantallas, y recién le va a fallar cuando
  intente algo que de verdad hable con Supabase (login, guardar un
  producto).
- `storage: AsyncStorage`: así la sesión de login persiste entre
  aperturas de la app (no hay que loguearse cada vez).
- `detectSessionInUrl: false`: esa opción es para apps web que leen la
  sesión de la URL del navegador al volver de un login. En React Native
  no aplica — el manejo del retorno del login se hace a mano en
  `services/auth.ts`.

---

## 5. `src/services/` — llamadas a Supabase que no son simples queries

### `auth.ts` — login con Google (RF1)

Es el archivo más delicado del proyecto hasta ahora, por eso vale la
pena entender el flujo paso a paso (ver también
[docs/incidentes-sprint1.md](incidentes-sprint1.md), puntos 3 a 5 y 10,
para el historial de bugs que aparecieron acá):

1. `signInWithGoogle()` le pide a Supabase la URL de autorización de
   Google, pasándole `redirectTo` (a dónde volver después) y
   `skipBrowserRedirect: true` (que no intente redirigir solo, porque
   en una app nativa no hay "el navegador" al que Supabase pueda
   mandar algo directamente).
2. Se abre esa URL con `expo-web-browser` (`openAuthSessionAsync`) —
   esto sí sabe abrir un navegador dentro de la app y esperar a que
   vuelva.
3. Cuando Google/Supabase terminan, la respuesta trae los tokens en el
   **fragment** de la URL (`#access_token=...`), no en el query string
   — por eso se parsea con `URLSearchParams` a mano en vez de usar
   `Linking.parse` (que está pensado para `?query`, no para `#fragment`).
4. Con esos tokens, `supabase.auth.setSession()` deja la sesión activa
   de verdad. A partir de ahí, `AuthContext` se entera solo (ver
   sección 6).

`signOut()` es mucho más simple: solo le pide a Supabase que cierre la
sesión.

### `hogares.ts` — ABM de hogar y multi-membresía (RF5, RF6)

`crearHogar`, `unirseAHogar` y `salirDeHogar` llaman a RPCs de Postgres
porque cada una toca más de una tabla a la vez (`hogares` +
`hogar_miembros`, o `usuarios` + `hogar_miembros`) y necesita ser atómica.
`editarHogar` es la excepción a propósito: renombrar un hogar es un
`update` de una sola fila de una sola tabla, así que usa `.update()`
directo contra `hogares` en vez de sumar una RPC — la policy
`hogares_update_propio_o_miembro_o_admin` (ver la migración de
multi-membresía) ya exige ser miembro del hogar o admin, así que no hace
falta duplicar esa validación en una función nueva.

### `externalApis.ts` — stubs de OCR/voz (RF4, RF8)

Define la **forma** de las funciones (`reconocerProductosDeTicket`,
`reconocerVencimientoDeFoto`, `interpretarComandoDeVoz`) que en los
sprints 5-8 van a llamar a las Edge Functions reales. Hoy cada una
llama a su función en `supabase/functions/` (ver sección 8), que
todavía no tiene lógica — devuelven respuestas vacías. La idea es que
cuando llegue el momento de integrar el proveedor de OCR/voz elegido,
solo haya que completar el cuerpo de la Edge Function, sin tocar las
pantallas que ya consuman estas funciones.

---

## 6. `src/context/AuthContext.tsx` — quién está logueado y con qué rol

Es la única fuente de verdad de sesión + perfil de usuario para el
resto de la app. Expone:

- `session`: la sesión cruda de Supabase Auth (o `null`).
- `usuario`: la fila de la tabla `usuarios` del usuario logueado (con su
  `rol`, `hogar_id`, etc.), o `null` si todavía no se cargó o falló.
- `loading`: true solo durante el arranque inicial de la app (mientras
  se chequea si ya había una sesión guardada).
- `usuarioLoading`: true mientras se está pidiendo la fila de `usuario`
  a la base — es un flag **separado** de `loading` a propósito, porque
  se puede volver a disparar en cualquier momento (por ejemplo, al
  loguearse de nuevo), no solo al arrancar la app.
- `refreshUsuario()`: vuelve a pedir la fila de `usuario` a mano. Sirve
  para el botón "Reintentar" de `HomeScreen`.

Internamente usa `supabase.auth.onAuthStateChange` para enterarse en
tiempo real de login/logout, y cada vez que cambia la sesión, dispara
`fetchUsuario()` para traer el perfil actualizado.

**Nota de un bug ya corregido** (ver incidentes, punto 8): antes,
`fetchUsuario` tragaba el error en silencio (`setUsuario(null)` sin más).
Ahora hace `console.warn` con el motivo real — si algo falla acá, va a
aparecer en la consola/logs, no va a quedar invisible.

---

## 7. `src/navigation/RootNavigator.tsx` — qué pantallas se ven

Decide entre dos stacks completos según haya sesión o no:

- **Sin sesión** (`AuthStack`): Welcome → Onboarding → Login.
- **Con sesión** (`AppStack`): hoy solo tiene Home; acá es donde se van
  a ir agregando las pantallas de hogar/productos en los próximos
  sprints.

Importante: **no mira el rol** todavía para decidir nada (cualquier
usuario logueado entra al mismo stack, sea `usuario` o
`administrador`) — eso es explícitamente para RF9 (sprint 9), no está
resuelto ni hace falta que lo esté ahora.

---

## 8. `src/components/` — piezas reutilizables

- **`ScreenContainer.tsx`**: envoltorio estándar de pantalla (safe area +
  fondo del theme + padding). Todas las pantallas lo usan para no
  repetir ese boilerplate.
- **`Button.tsx`**: un solo componente para los 3 estilos de botón que
  usa la app (`primary` y `secondary` con degradé, `outline` para
  acciones secundarias). Maneja loading (spinner) y disabled solo.
- **`Logo.tsx`**: placeholder de marca (emoji de casa + texto) hasta que
  se agregue el archivo real del logo a `assets/`. Está separado en su
  propio componente justo para que ese reemplazo futuro sea un cambio
  en un solo lugar, no buscar y reemplazar en cada pantalla.

## 9. `src/screens/` — pantallas de este sprint

- **`WelcomeScreen`**: logo + slogan + botón "Empezar".
- **`OnboardingScreen`**: 3 pasos estáticos (hogar, productos,
  vencimientos) con un dot indicator, sin librería externa de carrusel.
- **`LoginScreen`**: dispara `signInWithGoogle()` y muestra un
  `Alert` si falla.
- **`HomeScreen`**: placeholder mínimo post-login. Muestra loading /
  error-con-reintentar / datos reales según el estado de `usuario` en
  `AuthContext` (ver la nota del punto 6 y el incidente 8) — a
  propósito **no** asume un rol por default.

---

## 10. `App.tsx` / `index.ts` — arranque de la app

`index.ts` es el entry point que usa Expo (`registerRootComponent`).
`App.tsx` hace tres cosas antes de mostrar cualquier pantalla:

1. Carga las fuentes (`useFonts` de Poppins y Baloo 2) — mientras no
   terminen de cargar, muestra un spinner a pantalla completa.
2. Envuelve todo en `SafeAreaProvider` (necesario para que
   `ScreenContainer` funcione) y `AuthProvider` (sección 6).
3. Renderiza `RootNavigator` (sección 7).

---

## 11. `supabase/migrations/` — el esquema de la base, en orden

Los archivos se numeran para que se apliquen en secuencia (cada uno
puede depender del anterior). Resumen de qué hace cada uno — para el
detalle de *por qué* están hechos así (sobre todo los puntos raros),
ver [docs/incidentes-sprint1.md](incidentes-sprint1.md):

1. **`create_hogares`**: la tabla `hogares`, sin RLS todavía (se habilita
   recién en el archivo 5, una vez que existen las funciones helper).
2. **`create_usuarios`**: el enum `rol_usuario`, la tabla `usuarios`
   (1 a 1 con `auth.users`), y un trigger (`handle_new_auth_user`) que
   crea automáticamente la fila de `usuarios` apenas alguien se loguea
   por primera vez — nadie tiene que insertarla a mano.
3. **`create_helper_functions`**: `hogar_id_actual()` y
   `es_administrador()`, usadas dentro de las policies de RLS. Son
   `SECURITY DEFINER` a propósito — sin eso, entran en recursión
   infinita (ver incidente 7). Solo devuelven datos del usuario que las
   invoca, nunca de otro.
4. **`create_productos`**: la tabla `productos` (pertenece a un hogar),
   con un trigger que mantiene `updated_at` al día solo.
5. **`enable_rls`**: habilita RLS en las 3 tablas y define las policies
   (quién puede ver/insertar/editar/borrar qué fila). La regla general
   en las tres tablas es: **un usuario solo toca lo de su propio hogar**
   (usando las funciones del archivo 3), **o es admin** (bypassea esa
   restricción).

---

## 12. `supabase/functions/` — Edge Functions (hoy son stubs)

`ocr-ticket`, `vencimiento-foto` y `voz-a-texto` son los "receptores" de
lo que va a llamar `services/externalApis.ts`. Corren en Deno (no en
Node), por eso tienen su propio `deno.json` y están **excluidos** del
`tsconfig.json` de la raíz (si no, TypeScript se queja de que no
conoce el global `Deno`). Cada uno hoy valida que le llegue el dato
esperado (imagen/audio en base64) y devuelve una respuesta vacía con un
comentario `TODO` apuntando a qué sprint le toca la lógica real.
`_shared/cors.ts` son los headers CORS que comparten las tres.

---

## 13. Config del proyecto: `app.json`, `eas.json`, `tsconfig.json`, `babel.config.js`

- **`app.json`**: config de Expo. Lo más importante para el equipo:
  `"scheme": "stocky"` (el deep link que usa el login de Google fuera
  de Expo Go — ver incidente 2), y `extra.eas.projectId` +
  `android.package` (identidad del proyecto/app para EAS Build, no se
  deberían cambiar una vez que existan builds subidas).
- **`eas.json`**: perfiles de build de EAS (`development`, `preview`,
  `production`). El que usa el equipo hoy es `development`
  (`developmentClient: true`), para el dev client que reemplaza a Expo
  Go y no depende de la red (ver incidente 9).
- **`tsconfig.json`**: config de TypeScript, extiende la base de Expo.
  Excluye `supabase/functions` por el tema de Deno mencionado arriba, y
  fija `"types": ["jest"]` para que los archivos `*.test.ts` compilen
  (sin eso, TypeScript no reconoce `describe`/`it`/`expect` aunque
  `@types/jest` esté instalado).
- **`babel.config.js`**: necesario para que Jest sepa transformar
  JSX/TypeScript (`babel-preset-expo`). Se agregó recién al armar los
  tests — antes no hacía falta un archivo propio porque Metro (el
  bundler de Expo) usa un preset por default.

---

## 14. Tests: `*.test.ts` junto al código que prueban

Los tests (Jest + preset `jest-expo`) viven al lado del archivo que
prueban, no en una carpeta `__tests__/` aparte (`auth.test.ts` junto a
`auth.ts`, etc.) — así queda obvio qué código tiene cobertura con solo
mirar la carpeta. Ver [README](../README.md#tests) para correrlos y qué
cubren hoy. Todos mockean sus dependencias externas
(`jest.mock('../lib/supabase')`, etc.): son tests de la lógica propia,
no de integración real contra Supabase.

---

## Cómo mantener esto al día

Cuando se agregue una pieza nueva importante (una pantalla, un
servicio, una tabla), sumale una sección corta acá explicando **para
qué sirve y por qué se decidió así** — no hace falta repetir el código,
alcanza con el motivo que no se ve a simple vista leyendo los archivos.
