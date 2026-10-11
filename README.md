# Stocky

> tu hogar, siempre organizado

App móvil de inventario de hogar (React Native + Expo + TypeScript, backend
en Supabase). Trabajo integrador — Seminario Integrador 2026, UTN.

> Si algo de login, del development build o de Supabase falla y "ya pasó
> antes", revisá primero los registros de incidentes, uno por sprint:
> [1](docs/incidentes-sprint1.md), [2](docs/incidentes-sprint2.md),
> [3](docs/incidentes-sprint3.md), [4](docs/incidentes-sprint4.md),
> [5 y 6](docs/incidentes-sprint5-6.md), [8](docs/incidentes-sprint8.md),
> [9](docs/incidentes-sprint9.md) y [10](docs/incidentes-sprint10.md).
>
> **La app se prueba con el development build de [expo.dev](https://expo.dev)
> (EAS), no con Expo Go** (ver "Development build" más abajo). Las
> menciones a Expo Go en los incidentes de los primeros sprints son
> historial: en ese momento se usaba.
>
> Para saber qué probar en cada sprint (según quién esté de turno como
> dev o como QA — los roles rotan), ver
> [docs/plan-de-testing.md](docs/plan-de-testing.md).
>
> Para entender qué hace cada parte del código y por qué, ver
> [docs/arquitectura-del-codigo.md](docs/arquitectura-del-codigo.md).

## Stack

- React Native + Expo (SDK 57) + TypeScript
- Supabase: Auth (Google), PostgreSQL, Storage, Edge Functions
- React Navigation (native stack)

## Estructura

```
src/
  screens/      Pantallas (una por archivo, agrupan su propia lógica de UI)
  components/   Piezas de UI reutilizables (Button, ScreenContainer, Logo,
                 Header, BottomNavBar, HogarFormModal, HogarMiembrosModal,
                 SectionCard)
  navigation/    RootNavigator: decide stack de auth vs. stack principal
                 (y si mostrar "Cuenta deshabilitada" o los Términos)
  context/       AuthContext (sesión + perfil/rol) y NotificacionesContext
                 (campanita, cartelitos en tiempo real, push)
  services/      Llamadas a Supabase: auth, hogares, productos, catálogo,
                 usuarios (admin), notificaciones, términos, y las Edge
                 Functions externas (OCR/voz)
  lib/           Cliente de Supabase, avisos/cartelitos (alert.ts),
                 notificaciones del teléfono (notificacionesPush.ts), fotos, audio
  legal/         Términos y Condiciones (texto) y créditos de lo que usamos
  theme/         Colores, tipografía y spacing (única fuente de verdad de diseño)
  types/         Tipos espejo del esquema SQL + tipos de navegación

supabase/
  migrations/    SQL versionado (tablas + RLS), aplicado en orden por nombre
  functions/     Edge Functions: ocr-ticket (OCR.space), vencimiento-foto y voz-a-texto (Gemini)
```

## Setup local

1. `npm install`
2. Crear un proyecto en [supabase.com](https://supabase.com), copiar `.env.example` a `.env`
   y completar `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (Project Settings > API).
3. Aplicar las migraciones: con la [Supabase CLI](https://supabase.com/docs/guides/cli)
   instalada y el proyecto linkeado (`supabase link`), correr
   `supabase db push`. También se pueden pegar los archivos de
   `supabase/migrations/` en el SQL Editor del dashboard, en orden.
4. Login con Google (RF1): en el dashboard, Authentication > Providers >
   Google, cargar el client id/secret de un proyecto de Google Cloud con
   el redirect URI que indica Supabase. El flujo del lado de la app ya
   está armado en `src/services/auth.ts`.
5. Instalar el development build de expo.dev en el celular (ver
   "Development build" más abajo) y correr `npx expo start --dev-client`.

`npx expo start --dev-client` (celular, con el development build de expo.dev — la forma habitual)
`npx expo start --web` (iniciar la app en la web)
`npx expo start` (base; abre el menú para elegir dónde correrla)

## Probar el login de Google en desarrollo

Supabase exige que la URL de redirect post-login esté cargada, exacta,
en el dashboard (Authentication > URL Configuration > Redirect URLs).
Ya están cargadas:

- `http://localhost:*/**` — cubre `npx expo start --web` en cualquier
  puerto, de cualquier compu. No hace falta tocar nada para probar el
  login por web.
- `stocky://auth/callback` — la usa el **development build** (ver abajo).
  Fija para siempre, no depende de la red.

El equipo **no usa Expo Go** (usa el development build de expo.dev). Solo
como referencia, por si alguien lo vuelve a usar: Expo Go genera
`exp://<host>/--/auth/callback`, que depende de la IP/host de la sesión de
`npx expo start`, y Supabase exige match exacto (no acepta wildcard para
`exp://`), así que habría que cargar esa URL a mano cada vez (ver
[docs/incidentes-sprint1.md](docs/incidentes-sprint1.md) #4 y #5). Además,
en Android Expo Go no soporta las notificaciones push (desde el SDK 53) ni
los módulos nativos nuevos de la app. Redes con aislamiento de clientes
(WiFi de facultades/empresas) pueden bloquear la conexión con el celular:
en ese caso, usar el hotspot del celular como red intermedia.

### Development build de expo.dev (la forma en que se prueba la app)

El equipo prueba la app con un **development build** (una app instalada de
verdad, armada en [expo.dev](https://expo.dev) con
[EAS Build](https://docs.expo.dev/build/introduction/)):

```bash
npx eas-cli login              # una vez, con tu cuenta de Expo
npx eas-cli build:configure    # una vez por proyecto (ya está hecho)
npx eas-cli build --profile development --platform android
```

Instalá el APK que te da al final (QR o link) en tu celular, y corré:

```bash
npx expo start --dev-client
```

Solo hace falta una build nueva si se agrega una librería con código
nativo (cámara o audio en los sprints 5–8, `expo-notifications` y
`expo-device` en el Sprint 10); para cambios de JS/TS normales alcanza con
el hot reload, sin rearmar nada.

Para las **notificaciones push con la app cerrada** hace falta además
configurar Firebase y cargar sus credenciales en EAS: ver
[docs/incidentes-sprint10.md](docs/incidentes-sprint10.md) #1.

## Tests

```bash
npm test          # corre toda la suite una vez
npm run test:watch  # la deja corriendo y re-testea al guardar
```

Usa [Jest](https://jestjs.io/) con el preset `jest-expo`. Hoy cubre la
lógica pura que ya existe (no hay tests de pantallas/UI todavía):

- `src/services/auth.test.ts` — el parseo de tokens de la vuelta del
  login de Google (justo la parte que rompió más de una vez durante el
  desarrollo, ver [docs/incidentes-sprint1.md](docs/incidentes-sprint1.md)).
- `src/services/externalApis.test.ts` — que cada wrapper de OCR/voz llame
  a la Edge Function correcta con el body correcto.
- `src/theme/index.test.ts` — que la jerarquía de colores semánticos no
  se rompa sin querer.
- `src/services/hogares.test.ts` — crear/unirse/salir de un hogar llaman
  a la RPC correcta, y `listarMisHogares` filtra explícito por el usuario
  logueado (regresión del bug de QA en
  [docs/incidentes-sprint2.md](docs/incidentes-sprint2.md)).
- `src/services/productos.test.ts` — ABM de productos, vencimientos,
  duplicados, y el agrupado de lotes de la lista (`agruparProductos`,
  `ordenarLotes`).
- `src/services/voz.test.ts` — ABM por voz: a qué producto se refiere lo
  dicho, cantidad final, lote que vence primero, fechas inválidas.
- `src/services/geminiRespaldo.test.ts` — orden y respaldo en paralelo
  entre modelos de Gemini (`supabase/functions/_shared/gemini.ts`).
- `src/services/catalogo.test.ts` — sugerencias del catálogo, incluida la
  subida y el borrado de la foto en Storage.
- `src/services/escaneo.test.ts` — escaneo de tickets: matching tolerante
  con el catálogo, sugerencia de marca, líneas sin catálogo y fecha de
  vencimiento detectada por foto.
- `src/services/ticketParser.test.ts` — el parser del texto del OCR
  (`supabase/functions/_shared/ticket.ts`) contra los formatos de ticket
  reales probados (supermercado, restaurante, columnas separadas,
  subtotales por sección). Ver
  [docs/incidentes-sprint5-6.md](docs/incidentes-sprint5-6.md).
- `src/lib/fotos.test.ts` — detección de fotos HEIC (que los navegadores
  de escritorio no abren).
- `src/lib/catalogoImagenes.test.ts` — foto local antes que URL externa y
  consistencia de `assets/catalogo` (mapa generado, créditos y archivos).
- `src/services/usuarios.test.ts` — ABM de usuarios del admin (RPCs
  `admin_*`) y su búsqueda/filtro.
- `src/services/notificaciones.test.ts` — campanita (siempre filtrada por
  el usuario logueado), a dónde lleva cada notificación, tiempo relativo y
  cálculo de los avisos locales de vencimiento.
- `src/lib/notificacionesPush.test.ts` — permisos, registro del celular
  para push y avisos locales, con los módulos nativos mockeados.
- `src/lib/alert.test.ts` — avisos y confirmaciones: cartelitos propios
  cuando el `AvisosHost` está montado y el diálogo del sistema si no.
- `src/services/terminos.test.ts` y `src/legal/legal.test.ts` — cuándo hay
  que aceptar los Términos, la aceptación antes del login, y que cada foto
  del catálogo tenga autor, licencia y enlace.

Los tests mockean Supabase/expo-web-browser/expo-linking — no hacen
llamadas de red reales ni necesitan `.env` configurado. A medida que se
agregue lógica de negocio nueva (ABM de hogar, cálculo de stock, etc.),
conviene sumarle su test al lado, en el mismo commit.

## Home y hogares (RF5/RF6)

Al loguearse, la pantalla principal (`src/screens/HomeScreen.tsx`) muestra
un header con saludo + logo, la sección "Tus hogares activos", las alertas
(próximos a vencer y stock bajo, las primeras 4 de cada una con "Ver
todos"), la actividad reciente y una barra de navegación inferior fija
(Inicio/Búsqueda/Notificaciones/Perfil). La lupa abre el buscador de la
despensa del hogar seleccionado; la campanita, las notificaciones (con el
número de no leídas); Perfil todavía es un placeholder. Debajo de "Tus
hogares activos" hay dos botones directos, de un solo toque:

- **Crear hogar** → `HogarFormModal` (modo `crear`).
- **Unirme a un hogar** → `HogarFormModal` (modo `unirse`), a partir de un
  código de invitación; queda como solicitud pendiente hasta que el dueño
  la acepte o la rechace (ver `supabase/migrations/20260903120000_solicitudes_hogar.sql`).

Editar/salir de cada hogar y ver sus miembros están directo en cada fila de
"Tus hogares activos" (íconos de lápiz/salir/personas).

Un usuario puede pertenecer a **más de un hogar** a la vez (RF6): la
relación real vive en la tabla `hogar_miembros` (N a N), mientras que
`usuarios.hogar_id` sigue existiendo como "hogar activo" (el que se
muestra en Home). Las tres operaciones (crear, unirse por código, salir)
son funciones de Postgres (RPC) por ser atómicas — ver
`supabase/migrations/20260826130000_hogares_multi_membresia.sql` y su
wrapper en `src/services/hogares.ts`.

## Roles

`usuarios.rol` es `'usuario' | 'administrador'` (RF0): una sola tabla, no
dos entidades. Todo usuario nuevo entra como `'usuario'`. Desde el Sprint 9
un administrador gestiona los usuarios desde la app (pantalla **Usuarios**:
dar/quitar admin, habilitar/deshabilitar). Nadie puede cambiarse el rol a
sí mismo desde el cliente (ver [docs/incidentes-sprint9.md](docs/incidentes-sprint9.md) #1);
para el primer admin de un proyecto nuevo, asignarlo por SQL desde el
dashboard de Supabase.

## Términos y Condiciones

Se aceptan después del onboarding, antes del login, y quedan registrados
en `usuarios.terminos_version`. El texto y los créditos viven en
`src/legal/` (ver [docs/arquitectura-del-codigo.md](docs/arquitectura-del-codigo.md)).
Es un borrador del equipo: antes de publicar en las tiendas conviene una
revisión legal (ver [docs/incidentes-sprint10.md](docs/incidentes-sprint10.md)).

## APIs externas

`src/services/externalApis.ts` llama a las Edge Functions de OCR de tickets
(`ocr-ticket`, OCR.space), detección de vencimiento por foto
(`vencimiento-foto`, Gemini) y voz a texto (`voz-a-texto`, Gemini). Las keys
(`OCR_SPACE_KEY`, `GEMINI_API_KEY` y, opcional, `GEMINI_MODEL`) son secrets de
las funciones: se cargan con `supabase secrets set` y nunca van en el cliente
(ver `.env.example`). Qué se construyó, cómo se opera y qué errores
aparecieron: [docs/cambios-sprint5-6.md](docs/cambios-sprint5-6.md) y
[docs/incidentes-sprint5-6.md](docs/incidentes-sprint5-6.md).

Las fotos de los productos del catálogo viven en `assets/catalogo/` (no
dependen de ningún sitio externo); sus créditos y licencias están en
`assets/catalogo/CREDITOS.md`, que se genera con
`node scripts/generar-imagenes-catalogo.mjs`.
