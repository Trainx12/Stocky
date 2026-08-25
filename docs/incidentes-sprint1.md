# Incidentes y soluciones — Sprint 1

Registro de los problemas no triviales que aparecieron armando la base de
Stocky (Expo + Supabase + login con Google) y cómo se resolvió cada uno.
El objetivo es que si alguno de estos errores vuelve a aparecer (o le pasa
a otro integrante del equipo en su propia compu), no haya que
redescubrirlo de cero.

Para la configuración vigente (no el historial), ver [README.md](../README.md).

---

## 1. Expo Go no se podía instalar desde Play Store

**Síntoma:** `Project is incompatible with this version of Expo Go`, aun
con la última versión de la Play Store instalada.

**Causa raíz:** desde el SDK 55 de Expo, Expo Go dejó de distribuirse por
las tiendas oficiales para esas versiones. Cada build de Expo Go incluye
un único SDK, y el proyecto (SDK 57) no coincidía con el de la tienda.

**Solución:** instalar el APK de Expo Go correspondiente al SDK 57 directo
desde [expo.dev/go](https://expo.dev/go) (o `npx expo-go url android 57`
para conseguir el link de descarga), en vez de la app de Play Store.

---

## 2. `app.json` sin `"scheme"` configurado

**Síntoma:** warning de Metro (`Linking requires a build-time setting
'scheme'...`) y el deep link `stocky://` no existía realmente.

**Causa raíz:** faltó agregar `"scheme": "stocky"` en `app.json` desde el
armado inicial del proyecto — un descuido, no algo que dependiera de
configuración externa.

**Solución:** agregar `"scheme": "stocky"` a `app.json`. Necesario para
que el deep link de vuelta del login de Google funcione en cualquier
build que no sea Expo Go.

---

## 3. Supabase Auth: `provider is not enabled`

**Síntoma:** al tocar "Continuar con Google", error
`{"code":400,"error_code":"validation_failed","msg":"Unsupported
provider: provider is not enabled"}`.

**Causa raíz:** el proveedor de Google todavía no estaba activado en
Supabase (paso manual pendiente).

**Solución:** Authentication → Sign In / Providers → Google → activar +
cargar Client ID/Secret de Google Cloud.

---

## 4. Redirect URLs: wildcard no funciona para `exp://` / `stocky://`

**Síntoma:** después de elegir cuenta en Google, la app volvía a
`http://localhost:3000` (el Site URL por defecto) en vez de volver a la
app, con "conexión rechazada".

**Causa raíz:** Supabase Auth solo permite wildcards (`*`, `**`) en el
allow-list de Redirect URLs para esquemas `http(s)://`. Para esquemas
custom (`exp://`, `stocky://`) exige **match exacto**, carácter por
carácter. Cualquier patrón con wildcard sobre esos esquemas se ignora
silenciosamente y cae al Site URL.

**Solución:** cargar la URL exacta que genera la app
(`Linking.createURL('auth/callback')`) en vez de un patrón. Para
`stocky://` es fija (`stocky://auth/callback`); para `exp://` cambia
según la sesión de Expo Go (ver punto 5).

---

## 5. Expo Go + Supabase: bug conocido de IP en el redirect

**Síntoma:** aun cargando la URL exacta `exp://192.168.x.x:puerto/--/auth/callback`,
seguía sin funcionar (mismo error que el punto 4).

**Causa raíz:** bug documentado en Supabase Auth
([supabase/auth#2039](https://github.com/supabase/auth/issues/2039)):
el servicio bloquea automáticamente cualquier `redirect_to` cuyo host
"parezca una IP" (ej. `192.168.18.55`), como medida de seguridad genérica
contra open redirects — **sin mirar siquiera el allow-list**. Como Expo
Go en LAN siempre da una URL con la IP local, queda bloqueada pase lo que
pase.

**Solución (parche, no definitiva):** usar `npx expo start --tunnel`
(requiere `@expo/ngrok` como devDependency). El túnel da un hostname
(`exp://xxxx.anonymous.exp.direct/...`) en vez de una IP, esquivando el
bloqueo. Hay que volver a cargar esa URL en Supabase cada vez que se
reinicia el túnel (el subdominio cambia). Ver punto 8 para la solución
definitiva.

---

## 6. WiFi de la facultad bloqueaba todo

**Síntoma:** `CommandError: failed to start tunnel` / `session closed`
al usar `--tunnel`, y también fallaba el modo LAN normal
(`npx expo start` sin túnel) aun con el celular en la misma red que la
PC.

**Causa raíz:** la red de la facultad tiene **aislamiento de clientes**
(dos dispositivos en la misma WiFi no se ven entre sí) y probablemente
bloquea el tráfico saliente de ngrok con su firewall institucional.

**Solución:** usar el hotspot personal del celular como red intermedia
(PC conectada al hotspot del teléfono) para esquivar ambas
restricciones.

---

## 7. Recursión infinita en RLS (`stack depth limit exceeded`)

**Síntoma:** al promover al primer usuario a `administrador` y volver a
loguearse, la carga del perfil fallaba con un error de Postgres de
recursión.

**Causa raíz:** las funciones auxiliares `hogar_id_actual()` y
`es_administrador()` (usadas dentro de las policies de RLS de
`usuarios`) consultaban la propia tabla `usuarios`. Esa subquery interna
también quedaba sujeta a la misma policy de RLS que las invoca, y
Postgres no garantiza cortar por short-circuit en el `OR` de una policy
→ recursión infinita. Solo se manifestaba con un usuario `administrador`
real, por eso no apareció antes.

**Solución:** marcar ambas funciones como `SECURITY DEFINER` (con
`search_path` fijo), para que su consulta interna se salte la RLS en ese
paso puntual y corte el ciclo. No es un riesgo de seguridad: solo
devuelven datos sobre el propio usuario que las invoca.

Efecto secundario esperado: el linter de seguridad de Supabase marca
estas dos funciones como "SECURITY DEFINER ejecutable por
anon/authenticated" — es un warning aceptado a propósito, no se puede
revocar sin romper la RLS real.

---

## 8. UI mentía con "Rol: usuario" cuando el perfil no cargaba

**Síntoma:** después de promover a un usuario a admin y volver a
loguearse, la app seguía mostrando "Rol: usuario" en vez del rol real.

**Causa raíz:** bug de UI (no de datos): `HomeScreen` mostraba
`usuario?.rol ?? 'usuario'` — es decir, usaba `'usuario'` como valor por
default cuando el perfil todavía no había cargado (o había fallado el
fetch), en vez de distinguir "cargando/error" de "rol real". La base de
datos ya tenía el rol correcto en todo momento.

**Solución:** `HomeScreen` ahora distingue tres estados (cargando / con
datos / error con botón "Reintentar"), y `AuthContext` loguea el motivo
real si el fetch del perfil falla, en vez de tragarlo en silencio.

---

## 9. Development build con EAS (solución definitiva al punto 5)

Para dejar de depender de IPs/túneles al probar el login de Google, se
armó un **development build** con EAS (`expo-dev-client` + `eas.json`).
Esa build usa el deep link fijo `stocky://auth/callback` — no cambia
según la red, así que la entrada en Supabase quedó cargada una sola vez,
para siempre, sin importar en qué WiFi esté cada integrante del equipo.

Expo Go sigue teniendo el problema del punto 5 si se lo usa; el
development build lo evita por completo.

---

## 10. Suspensión de la cuenta de Google usada para el OAuth client

**Síntoma:** login de Google fallando con
`Error 401: disabled_client` / "The OAuth client was disabled."

**Causa raíz:** Google suspendió la cuenta de Google Cloud usada para
crear las credenciales OAuth, marcándola como creada por un bot (falso
positivo de sus sistemas automáticos de detección de abuso — no hubo
ningún uso indebido real).

**Resolución:**
- Se inició una apelación ante Google señalando que la cuenta fue creada
  y usada legítimamente por el equipo.
- **Mientras se esperaba respuesta**, se armó un cliente OAuth de
  reemplazo en una cuenta de Google distinta (no afectada), y se
  actualizaron el Client ID/Secret en Supabase (Authentication →
  Providers → Google), sin tocar nada más del proyecto. Esto evitó
  frenar el desarrollo mientras se resolvía.
- **Resultado:** la apelación fue **aprobada** — la cuenta original ya
  no está suspendida.

**Pendiente de decisión del equipo:** hoy la app está usando el cliente
OAuth de reemplazo (cuenta alternativa). Se puede volver a usar el
cliente original en cualquier momento (solo cambiando Client ID/Secret
en Supabase de nuevo) o simplemente seguir con el actual — funcionalmente
da lo mismo, es una decisión de conveniencia del equipo, no técnica.

---

## Estado actual (para referencia rápida)

- Redirect URLs cargadas en Supabase: `http://localhost:*/**` (web, para
  siempre), `stocky://auth/callback` (development build, para siempre).
  Cualquier entrada `exp://...` que quede es de una sesión de túnel
  vieja y se puede borrar sin problema.
- Login de Google probado end-to-end en: navegador web, Expo Go (con
  túnel) y el development build instalado en Android.
- Primer usuario admin: `ruttyfacundo@gmail.com` (promovido a mano vía
  SQL; ver README para el procedimiento).
