# Stocky

> tu hogar, siempre organizado

App móvil de inventario de hogar (React Native + Expo + TypeScript, backend
en Supabase). Trabajo integrador — Seminario Integrador 2026, UTN.

> Si algo de login/Expo Go/Supabase falla y "ya pasó antes", revisá
> primero [docs/incidentes-sprint1.md](docs/incidentes-sprint1.md).

## Stack

- React Native + Expo (SDK 57) + TypeScript
- Supabase: Auth (Google), PostgreSQL, Storage, Edge Functions
- React Navigation (native stack)

## Estructura

```
src/
  screens/      Pantallas (una por archivo, agrupan su propia lógica de UI)
  components/   Piezas de UI reutilizables (Button, ScreenContainer, Logo)
  navigation/    RootNavigator: decide stack de auth vs. stack principal
  context/       AuthContext: sesión de Supabase + perfil/rol del usuario
  services/      Llamadas a Supabase Auth y a las Edge Functions externas
  lib/           Cliente de Supabase configurado (lib/supabase.ts)
  theme/         Colores, tipografía y spacing (única fuente de verdad de diseño)
  types/         Tipos espejo del esquema SQL + tipos de navegación

supabase/
  migrations/    SQL versionado (tablas + RLS), aplicado en orden por nombre
  functions/     Edge Functions (hoy son stubs: ocr-ticket, vencimiento-foto, voz-a-texto)
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
5. `npx expo start` y abrir en Expo Go o en un emulador.

`npx expo start --web` (Iniciar app en la web)
`npx expo start` (Base)
`npx expo start --dev-client` (Iniciar en expo.dev)

## Probar el login de Google en desarrollo

Supabase exige que la URL de redirect post-login esté cargada, exacta,
en el dashboard (Authentication > URL Configuration > Redirect URLs).
Ya están cargadas:

- `http://localhost:*/**` — cubre `npx expo start --web` en cualquier
  puerto, de cualquier compu. No hace falta tocar nada para probar el
  login por web.
- `stocky://auth/callback` — la usa el **development build** (ver abajo).
  Fija para siempre, no depende de la red.

**Expo Go es la única forma que sí requiere retocar esto**: cada
`exp://<host>/--/auth/callback` que genera Expo Go depende de la IP/host
de la sesión de `npx expo start` (o del subdominio si usás `--tunnel`), y
Supabase exige match exacto (no acepta wildcard para `exp://`). Si
necesitás probar el login puntualmente ahí: mirá qué `redirectTo` genera
la app (podés loggearlo temporalmente en `src/services/auth.ts`) y
agregalo tal cual a la lista de Redirect URLs. Además, redes con
aislamiento de clientes (WiFi de facultades/empresas) pueden bloquear
Expo Go y `--tunnel` por completo — en ese caso, usar el hotspot del
celular como red intermedia suele resolverlo.

### Development build (recomendado para probar login de Google)

Para no tener que repetir el punto anterior en cada compu/red, el equipo
usa un **development build** (una app instalada de verdad, no Expo Go)
con [EAS Build](https://docs.expo.dev/build/introduction/):

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
nativo (por ejemplo, cámara o audio en sprints 5–8); para cambios de
JS/TS normales, el hot reload funciona igual que con Expo Go.

## Roles

`usuarios.rol` es `'usuario' | 'administrador'` (RF0): una sola tabla, no
dos entidades. Todo usuario nuevo entra como `'usuario'`; el rol
`'administrador'` se asigna a mano (UPDATE en la tabla) hasta que exista
la gestión de usuarios de RF9 (sprint 9).

## APIs externas (todavía no implementadas)

`src/services/externalApis.ts` ya define la forma de las funciones que
van a llamar a las Edge Functions de OCR de tickets, detección de
vencimiento por foto y voz a texto. Los stubs en `supabase/functions/`
están listos para recibir la lógica del proveedor elegido en los sprints
5–8; hasta entonces devuelven respuestas vacías.
