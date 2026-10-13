# Incidentes y notas — Sprint 10 (notificaciones)

Registro de los problemas y decisiones de las **notificaciones** (campanita,
push al teléfono, avisos de vencimiento configurables y cartelitos propios en
vez de los diálogos del sistema), rama `feature/notificaciones`, apilada sobre
el PR #15. Mismo espíritu que
[incidentes-sprint1.md](incidentes-sprint1.md) a
[incidentes-sprint9.md](incidentes-sprint9.md).

Migración nueva:
[20261012120000_notificaciones.sql](../supabase/migrations/20261012120000_notificaciones.sql),
**ya aplicada** en el proyecto de Supabase (2026-10-11). Verificado por SQL:
`pg_net` (en `extensions`) y `pg_cron` instalados, tablas `notificaciones` y
`push_tokens`, los 4 triggers, el job `notificar-vencimientos` (`0 12 * * *`),
`notificaciones` en Realtime, y permisos: `authenticated` no puede insertar
notificaciones ni editar más que `leida`, no ve `push_tokens`, no puede
correr el job, y de `usuarios` solo edita `nombre` y `dias_aviso_vencimiento`.
`get_advisors` (seguridad): sin hallazgos nuevos salvo los esperados (ver #4).

---

## Qué entró

| Cambio | Dónde |
|---|---|
| Campanita con notificaciones recientes, sin leer resaltadas, numerito en la barra de abajo | `NotificacionesScreen`, `BottomNavBar`, `services/notificaciones.ts` |
| Notificaciones generadas en la base (nadie tiene que "acordarse" de avisar) | triggers en `hogar_miembros`, `productos`, `productos_catalogo` |
| Aviso de vencimiento con días configurables: general por usuario y opcional por producto | `usuarios.dias_aviso_vencimiento`, `productos.dias_aviso_vencimiento`, job diario `pg_cron` |
| Push al teléfono con la app cerrada | `push_tokens` + trigger con `pg_net` → Expo Push API, `lib/notificacionesPush.ts` |
| Plan B si no hay push: avisos de vencimiento programados en el celular | `calcularAvisosLocales`, `programarAvisosLocales` |
| Cartelitos con el diseño de la app en vez de "localhost dice..." / diálogos del sistema | `components/AvisosHost.tsx`, `lib/alert.ts` |

Qué genera una notificación:

| Evento | Quién la recibe |
|---|---|
| Alguien manda el código de un hogar | los dueños de ese hogar |
| Te invitan por mail | el invitado |
| Te aceptan / aceptan tu invitación | quien pidió entrar / los dueños |
| Te rechazan o te sacan de un hogar | el afectado (solo si lo hizo otra persona) |
| Te pasan el rol de dueño | el nuevo dueño |
| Un producto cruza su stock mínimo (o se termina) | todos los miembros del hogar |
| Un producto entra en su ventana de aviso / se vence | todos los miembros (job diario, 9:00 de Argentina) |
| Sugerencia nueva / aprobada / rechazada | los admins / quien sugirió |

---

## 1. Push con la app cerrada: qué hace falta (pasos manuales, pendientes)

**Contexto (doc de expo-notifications, SDK 57):** el push remoto **no existe
en Expo Go para Android** desde el SDK 53; necesita un *development build*.
El equipo usa el development build de expo.dev (EAS), así que se puede, pero
hay dos pasos que no puede hacer Claude:

1. **Firebase (Android):** crear un proyecto en
   [console.firebase.google.com](https://console.firebase.google.com), agregar
   una app Android con el package `com.stocky2026.stocky`, descargar
   `google-services.json` a la raíz del repo y agregar en `app.json`, dentro de
   `"android"`: `"googleServicesFile": "./google-services.json"`. Después,
   en Firebase → Configuración del proyecto → Cuentas de servicio, generar una
   clave privada (JSON) y subirla a EAS: `eas credentials` → Android →
   *Google Service Account Key for Push Notifications (FCM V1)*. Guía oficial:
   https://docs.expo.dev/push-notifications/fcm-credentials/
2. **Nuevo development build:** `expo-notifications` y `expo-device` son
   módulos nativos nuevos → `eas build --profile development --platform android`
   e instalar el APK nuevo.

(iOS necesita además una cuenta paga de Apple Developer para las claves APNs;
no se configuró.)

**Mientras falten esos pasos:** la campanita y los cartelitos funcionan igual
(son de la base + Realtime, no dependen de Firebase). `getExpoPushTokenAsync`
falla, `registrarPush()` devuelve `null` sin romper nada, y la app usa el
**plan B**: programa en el celular los avisos de vencimiento (llegan con la
app cerrada, solo vencimientos). Las solicitudes/aceptaciones/stock bajo con
la app cerrada recién llegan cuando esté Firebase.

**Con la app abierta** no se muestra el push del sistema (handler con
`shouldShowBanner: false`): la app ya muestra su cartelito por Realtime y
saldrían dos avisos iguales.

---

## 2. Avisos duplicados con los que ya mostraba HomeScreen

**Síntoma (detectado al diseñarlo, antes de que pase):** `HomeScreen` ya
mostraba "Solicitud aceptada", "Te sacaron de un hogar", etc. escuchando
Realtime sobre `hogar_miembros`. Con las notificaciones nuevas, cada evento
iba a mostrar **dos** cartelitos.

**Solución:** esos handlers ahora solo recargan los datos; el cartelito lo
muestra `NotificacionesContext` al llegar la notificación (que además trae el
nombre del hogar, que antes no se mostraba). De paso, la base sí sabe quién
borró una fila (`auth.uid()` en el trigger), así que "cancelé mi propia
solicitud" ya no puede confundirse con "me rechazaron" (el problema de
[incidentes-sprint4.md](incidentes-sprint4.md) #2, resuelto ahora del lado
del servidor).

---

## 3. Triggers que insertan notificaciones y borrados en cascada

**Riesgo (detectado al escribir la migración):** si se borra un hogar, Postgres
borra en cascada sus `hogar_miembros` y `productos`; un trigger `AFTER DELETE`
que insertara una notificación con `hogar_id` de ese hogar fallaría por la FK
y **abortaría el borrado del hogar**.

**Solución:** los triggers no notifican sin usuario (`auth.uid()` nulo: SQL
editor, borrados desde el dashboard), buscan el nombre del hogar y si ya no
existe no hacen nada, las notificaciones de expulsión/rechazo van con
`hogar_id = null`, y el de stock no se dispara en `DELETE`. El envío del push
atrapa cualquier error (`exception when others`): un push que falla nunca
impide guardar la notificación.

---

## 4. `pg_net` quedó instalado en el esquema `public` — *error de implementación*

**Síntoma:** después de aplicar la migración, `get_advisors` (seguridad) marcó
*Extension in Public: pg_net*.

**Causa:** la migración decía `create extension if not exists pg_net;` sin
esquema, y Postgres la instaló en `public` (expuesto por la API).

**Solución:** `pg_net` no se puede mover (`extrelocatable = false`), así que
se reinstaló: `drop extension pg_net; create extension pg_net with schema
extensions;` (migración `pg_net_en_schema_extensions` aplicada en el
proyecto; la cola de pedidos estaba vacía y nada dependía de la extensión).
Sus funciones siguen en el esquema `net`, así que `enviar_push_notificacion`
no cambió. El archivo de la migración del repo ya crea la extensión con
`with schema extensions`, para que en un proyecto nuevo no vuelva a pasar.
Después de esto, `get_advisors` solo muestra lo esperado: el warning ya
aceptado de "SECURITY DEFINER ejecutable" (incidentes-sprint1.md #7), ahora
también para las RPCs de push, y un INFO de que `push_tokens` tiene RLS sin
policies, que es a propósito (solo se accede por RPC).

**Lección:** al crear una extensión en Supabase, indicar siempre `with schema
extensions`.

---

## Notas de diseño

- **Stock en el servidor = misma regla que la app:** `nivel_stock()` replica
  `estadoStock()` (sin mínimo nunca alerta, "bajo" estricto) y agrupa los lotes
  por nombre + unidad como `agruparProductos`. Diferencia aceptada: la base
  compara con `lower(trim(nombre))`, sin sacar tildes (la app sí las saca).
  Solo avisa al **cruzar** el umbral (de ok a bajo, o de bajo a sin stock):
  restar de a uno no manda una notificación por toque.
- **Vencimientos:** se avisa una vez por lote y fecha (`clave` única). Si se
  corrige la fecha, se vuelve a avisar. Los vencidos solo se avisan si
  vencieron en la última semana (la primera corrida no manda avisos por cosas
  vencidas hace meses). El job corre a las 12:00 UTC (9:00 de Argentina);
  cambiar los días de aviso se refleja en la próxima corrida. Para probarlo
  sin esperar: `select public.generar_notificaciones_vencimiento();` desde el
  SQL editor.
- **Días de aviso:** general por usuario (1-60, default 7, se cambia en la
  campanita) y opcional por producto (en su formulario; vacío = el general).
  La misma regla (`diasAvisoDe`) decide el badge de la despensa, la tarjeta
  del Home, el job del servidor y los avisos locales.
- **Privacidad:** cada uno ve solo sus notificaciones, ni un admin ve las de
  otros (la policy no tiene `or es_administrador()`), y las consultas igual
  filtran explícito por el usuario ([incidentes-sprint2.md](incidentes-sprint2.md) #2).
  `push_tokens` no tiene policies: solo se toca por las RPCs
  `registrar_push_token` / `eliminar_push_token`. Al cerrar sesión, el
  celular se desregistra antes del `signOut` (si no, seguiría recibiendo los
  push de la cuenta anterior).
- **Cartelitos:** `avisar()`/`confirmar()` mantienen su firma, así que los ~40
  usos existentes pasaron a verse con el diseño de la app sin tocarlos. El
  color se deduce del título ("Error..." coral, "Listo"/"...agregado(s)" verde,
  el resto violeta). Si `AvisosHost` no está montado (tests), se usa el
  comportamiento anterior.

## Limitaciones conocidas

- Los tokens que Expo reporta como inválidos (`DeviceNotRegistered`) no se
  limpian solos: `pg_net` manda el pedido pero no se procesa la respuesta.
  Un token viejo solo genera un pedido de más.
- En web no hay notificaciones del sistema (expo-notifications no soporta
  web): solo campanita y cartelitos.

---

## Errores de proceso

1. **Heredocs de bash con comillas (otra vez):** igual que
   [incidentes-sprint5-6.md](incidentes-sprint5-6.md) #11 y
   [incidentes-sprint9.md](incidentes-sprint9.md), dos scripts de edición
   pasados por heredoc fallaron con `unexpected EOF`. Se escribieron a archivo
   con la herramienta de edición. **Para el próximo:** no pasar scripts con
   comillas simples dentro de un heredoc en esta terminal; escribirlos a
   archivo directamente.
2. **Mocks de módulos nativos en Jest:** mockear `react-native` entero rompió
   el setup de jest-expo (`Platform.select` undefined); un `Proxy` como mock de
   `expo-notifications` no sirvió porque `import * as` copia las propiedades al
   importar. Solución: mocks definidos dentro de la factory y leídos con
   `jest.requireMock`, y un getter para `Device.isDevice` (ver
   `notificacionesPush.test.ts`). Volvió a pasar con
   `createNavigationContainerRef` en `navegacion.test.ts` (el ref se crea al
   importar): mismo arreglo. **Regla:** si el módulo bajo prueba usa el mock
   al importarse, el mock va entero dentro de la factory.
3. **`to_char` con decimales** dejaba "3." en enteros en el mensaje de stock;
   se cambió por `trim_scale()` antes de aplicar la migración.

---

# Términos y Condiciones (también Sprint 10)

Rama `feature/terminos-y-condiciones`, apilada sobre el PR de notificaciones.
Migración: [20261013120000_terminos_aceptados.sql](../supabase/migrations/20261013120000_terminos_aceptados.sql).
**Ya aplicada** en el proyecto de Supabase (2026-10-11): verificado por SQL que
existen las dos columnas, que `authenticated` no puede editarlas directo y que
`aceptar_terminos` solo la ejecutan usuarios logueados. `get_advisors`: sin
hallazgos nuevos (solo `aceptar_terminos` en el warning ya aceptado de
"SECURITY DEFINER ejecutable").

## Qué entró

- **Carpeta `src/legal/`**: todo el texto legal como datos
  (`terminos.ts`: versión, secciones, servicios y software usados) y los
  créditos de las fotos (`creditos.ts`, que importa
  `assets/catalogo/creditos.json`, la misma fuente que `CREDITOS.md`).
- **Flujo:** Bienvenida → Onboarding → **Términos** (hay que tildar "Leí y
  acepto") → Login. Desde el Home hay un enlace para volver a leerlos.
- **Constancia:** `usuarios.terminos_version` + `terminos_aceptados_at` (hora
  del servidor), por la RPC `aceptar_terminos`. Lo aceptado antes del login
  se anota en el celular y se registra en la base apenas inicia sesión.
- **Usuarios existentes y versiones nuevas:** si la versión aceptada no es la
  vigente (`VERSION_TERMINOS`), al entrar se muestran los términos y no se
  puede usar la app hasta aceptarlos. Para publicar un cambio de fondo, subir
  `VERSION_TERMINOS` en `src/legal/terminos.ts`.
- **Al final, créditos:** servicios (Supabase, Google, Gemini, OCR.space,
  Expo, Open Food Facts, Wikimedia), software de código abierto con su
  licencia, y las 257 fotos del catálogo con autor, licencia y enlace
  (requisito de atribución de CC BY / CC BY-SA), plegadas detrás de "Ver los
  257 créditos de fotos".

Contenido cubierto (pedido del equipo): qué datos se usan y para qué, que la
información cargada puede usarse (agregada o sin identificar a nadie) para
mejorar Stocky, el catálogo y productos futuros, licencia sobre las fotos y
sugerencias que mandan los usuarios, que las sugerencias las revisan los
administradores, servicios de terceros, hogares compartidos, derechos de la
Ley 25.326, aviso de que la lectura automática puede equivocarse (revisar
vencimientos), uso aceptable, limitación de responsabilidad, cambios y ley
aplicable (Argentina).

## 5. El Login prometía algo que la app no hace

**Síntoma (encontrado al revisar el texto):** `LoginScreen` decía "Podés
eliminar tu cuenta cuando quieras", pero no existe ninguna forma de borrar la
cuenta desde la app.

**Solución:** el texto del Login ahora remite a los Términos aceptados, y los
Términos dicen que la eliminación se pide al equipo (punto 8).

## 6. Menciones a Expo Go en la documentación

**Síntoma:** el README y la arquitectura decían que el equipo probaba con
Expo Go, pero el equipo usa el **development build de expo.dev** (y desde las
notificaciones es obligatorio: Expo Go en Android no soporta push).

**Solución:** se actualizaron README, `arquitectura-del-codigo.md`,
`plan-de-testing.md` y los comentarios de código para decir que se usa el
development build de expo.dev y cuándo hay que rearmarlo. En los incidentes
de los Sprints 1-3 **no se reescribió lo que pasó** (en ese momento sí se
usaba Expo Go): se agregó una nota arriba aclarando que es historial.

## Lo que no tiene test (y por qué)

- `src/lib/grabacion.ts` (`useGrabadorDeVoz`, Sprint 8) y
  `context/NotificacionesContext.tsx` son hooks/componentes de React que
  dependen de módulos nativos y de Realtime; el proyecto no tiene
  infraestructura de tests de componentes (solo de lógica). Su lógica pura
  sí está testeada aparte (`calcularAvisosLocales`, `aparienciaNotificacion`,
  `destinoNotificacion`, etc.). Si se suma `@testing-library/react-native`,
  son los primeros candidatos.
- Las pantallas (`*Screen.tsx`) tampoco tienen tests, por el mismo motivo:
  la lógica que tenían adentro se sacó a `services/` para poder testearla
  (por ejemplo `textoVerTodos` y `ajustarDiasAviso`).

## Pendientes antes de publicar (para el equipo)

- **Revisión legal:** el texto es un borrador del equipo, no asesoramiento
  legal. Conviene que lo revise un profesional antes de publicar en las
  tiendas.
- **Contacto:** los términos dicen "contactando al equipo de Stocky" sin un
  correo concreto. Falta definir un correo de contacto y agregarlo al punto 8.
- **Eliminar la cuenta:** hoy no hay una función para borrar la cuenta; se
  hace a mano. Las tiendas suelen exigir una opción dentro de la app.
- **7 fotos "aportadas por el equipo"** figuran con licencia "a confirmar"
  (ver incidentes-sprint5-6.md #18 e incidentes-sprint8.md #7; la de Leche de
  Coco parece una imagen publicitaria). Confirmar su origen o reemplazarlas.


---

# Cuenta, modo oscuro, varias cuentas y edición del ticket (también Sprint 10)

Rama `feature/cuenta-y-ajustes`, apilada sobre el PR de términos (#17). Sin
migraciones nuevas.

## Qué entró

- **Botón de la persona → Cuenta:** perfil con nombre editable, varias
  cuentas, apariencia, accesos a Notificaciones y Términos, versión, y
  cerrar sesión.
- **Modo oscuro** (sistema / claro / oscuro), elegido desde Cuenta y
  guardado en el celular.
- **Varias cuentas** en el mismo celular, cambiando entre ellas sin pasar por
  el login (como Instagram).
- **Revisión del ticket:** corregir un producto mal leído (cambiarlo por
  otro del catálogo o escribirlo a mano), cantidad, marca y vencimiento, con
  aviso por producto si le falta algo.

## 7. Cerrar sesión cerraba la sesión en TODOS los dispositivos

**Síntoma (encontrado al diseñar varias cuentas):** `signOut()` llamaba a
`supabase.auth.signOut()` sin parámetros, que por defecto usa `scope:
'global'`: cerrar sesión en el celular cerraba también la sesión de esa
persona en la web y en cualquier otro dispositivo.

**Solución:** `signOut({ scope: 'local' })`: solo este celular. Con varias
cuentas, además pasa a la siguiente cuenta guardada.

## 8. Google entraba siempre con la última cuenta usada

**Causa:** sin indicarle nada, el login de Google reutiliza la cuenta con la
que ya se había entrado, así que "Agregar otra cuenta" volvía a entrar con
la misma.

**Solución:** `queryParams: { prompt: 'select_account' }` en el login: Google
siempre pregunta con qué cuenta entrar.

## Notas de diseño

- **Varias cuentas:** los tokens de las cuentas no activas se guardan en
  AsyncStorage, igual que Supabase guarda los de la sesión activa (mismo
  nivel de seguridad). Si la sesión guardada de una cuenta venció o se
  cerró desde otro lado, al tocarla se avisa y se saca de la lista. Las
  notificaciones push llegan solo para la cuenta activa del celular.
  "Cerrar sesión en todas" olvida las cuentas en el celular; sus sesiones
  en el servidor vencen solas.
- **Modo oscuro:** es una preferencia del celular, no de la cuenta (no
  cambia al pasar de una cuenta a otra). **Por defecto es "Sistema"**: copia
  el modo del celular (se probó dejar "Claro" por defecto y el equipo
  decidió volver a "Sistema").
  Para que "Sistema" funcione en el celular, `app.json` pasó de
  `"userInterfaceStyle": "light"` (que le decía al teléfono que la app es
  siempre clara, y entonces nunca informaba el modo oscuro) a `"automatic"`;
  se aplica con el próximo build. La regla para escribir componentes nuevos está en
  `docs/arquitectura-del-codigo.md`, sección 2.
- **Ticket:** "Cambiar producto" conserva lo que el usuario ya corrigió
  (cantidad, marca, fecha) y solo cambia nombre/categoría/unidad.

## Errores de proceso

1. **Conversión de los 25 archivos al modo oscuro:** se hizo con un script
   (estilos → función + `useEstilos` en cada componente) y se usó `tsc`
   como red de seguridad (un componente sin el hook da "Cannot find name
   'styles'"): pasó a la primera. El script dejó la indentación interna de
   los estilos como estaba (válida, solo estética), y eso hizo fallar
   después un reemplazo que asumía la indentación vieja; se corrigió con
   una expresión que no depende de la indentación.
2. **Constantes de módulo con colores:** quedaban 3 (`AvisosHost`,
   `ComandoVozModal`, `NotificacionesScreen`) que se habrían quedado con
   los colores del modo inicial; se encontraron buscando `colors.` fuera
   de los estilos y se pasaron a funciones.
3. **Tests y AsyncStorage:** `auth.test.ts` dejó de correr porque `auth.ts`
   ahora importa `cuentas.ts` (AsyncStorage nativo); un primer intento con
   `jest.requireActual('./cuentas')` volvió a cargarlo. Se mockeó
   `./cuentas` entero con la regla pura copiada. En `cuentas.test.ts`, un
   test fallaba porque el `setSession` simulado no tenía respuesta por
   defecto.
4. **El servidor de Expo del equipo seguía corriendo** sobre esta carpeta
   mientras se programaba: los cambios de la rama le llegaban al celular por
   hot reload. Mismo riesgo que [incidentes-sprint9.md](incidentes-sprint9.md)
   #4: saber desde qué rama corre Metro. Para verificar en el navegador se
   usó ese mismo servidor (no se levantó otro) y se forzó el modo oscuro
   desde el almacenamiento local, sin tocar nada del equipo.

## Lo que no se pudo verificar

Probado en el navegador: modo oscuro en Bienvenida, Onboarding y Términos
(sin errores de consola). **No probado** (necesita login con Google): la
pantalla Cuenta, cambiar y agregar cuentas, editar el nombre y la revisión
del ticket con un ticket real.

---

# Actualización de Expo 57.0.16 → 57.0.27 (también Sprint 10)

Hecha en la misma rama que Cuenta (PR #18), a pedido del equipo, para hacer
un solo development build con todo. Son actualizaciones de parche dentro del
SDK 57: `expo`, `expo-dev-client`, `expo-font`, `expo-image-manipulator`,
`expo-linear-gradient`, `expo-linking`, `expo-web-browser`, `react-native`
(0.86.2 → 0.86.3) y `jest-expo`.

## 9. `npx expo install --fix` fallaba por un conflicto de dependencias

**Síntoma:** `npm error ERESOLVE could not resolve` — `react-native@0.86.3`
pide `@react-native/jest-preset@0.86.3`, pero el `jest-expo@57.0.4`
instalado traía el 0.86.2; y `jest-expo@57.0.5` (el que sí trae 0.86.3) no
se podía instalar porque el `package-lock.json` seguía con el 0.86.2. Cada
uno necesitaba al otro ya actualizado.

**Solución:** instalar las piezas que dependen entre sí en un mismo comando
(`react-native@0.86.3`, `jest-expo@~57.0.5` y `@react-native/jest-preset@0.86.3`)
para que el lock quede con las tres versiones nuevas, después sacar
`@react-native/jest-preset` como dependencia directa (la sigue trayendo
`jest-expo`) y fijar `react-native` en `0.86.3` exacto (npm lo había
guardado como `^0.86.3`). Verificado: `npm install` limpio sin errores,
`npx expo install --check` → "Dependencies are up to date".

**Lección:** si `expo install --fix` falla por peers, no usar `--force` ni
`--legacy-peer-deps` (esconden el problema); ver en el error qué paquete
fija la versión vieja y actualizarlo junto con el resto.

## 10. Faltaba `expo-asset` desde el Sprint 8 — encontrado con `expo-doctor`

**Síntoma:** ninguno visible todavía. `npx expo-doctor` (corrido después de
actualizar) avisó: *Missing peer dependency: expo-asset, required by
expo-audio*, con la advertencia de que la app puede cerrarse sola fuera de
Expo Go, o sea, en el development build que usa el equipo.

**Causa:** al sumar la voz (`expo-audio`, Sprint 8) no se instaló su
dependencia nativa `expo-asset`, que tiene que estar declarada directamente
en el proyecto.

**Solución:** `npx expo install expo-asset` (también agrega su plugin en
`app.json`). `expo-doctor`: 21/21 chequeos OK.

**Lección:** correr `npx expo-doctor` cada vez que se agrega una librería
nativa, antes de armar el build.

**Después de bajar esta rama:** `npm install`, reiniciar `npx expo start
--dev-client --clear`, y armar un **development build nuevo** (`eas build
--profile development --platform android`): cambian módulos nativos
(`react-native`, `expo-dev-client`, `expo-asset`, más `expo-notifications`
y `expo-device` de las notificaciones).

## 11. Links viejos de Open Food Facts en `productos_catalogo.imagen_url`

**Pregunta del equipo:** ¿se sigue usando `imagen_url`? Si se borran los
links viejos, ¿se pierde el respaldo?

**Lo que había:** 65 filas con `imagen_url`: 64 links a Open Food Facts de
antes de que las fotos pasaran al repo (`assets/catalogo`), y 1 foto de una
sugerencia aprobada (Mandioca, en el bucket `catalogo-sugerencias`).

**Análisis:** la app muestra primero la foto local y solo usa `imagen_url` si
no hay (`imagenDeCatalogo`). Se verificó con la misma regla de nombres que
usa la app (`slugCatalogo`) que **los 64 tienen foto local** (archivo y
entrada en el mapa generado), así que esos links no se mostraban nunca. No
eran un respaldo real: la foto local viaja dentro de la app, y si alguna
faltara, el "respaldo" mostraría la foto vieja de Open Food Facts, varias de
ellas reemplazadas por estar mal o tener marca (incidentes-sprint5-6.md #17).

**Solución:** migración
[20261014120000_quitar_links_open_food_facts.sql](../supabase/migrations/20261014120000_quitar_links_open_food_facts.sql)
(ya aplicada): pone en null solo los links de Open Food Facts. Queda
`imagen_url` solo en Mandioca. La columna se mantiene porque es donde quedan
las fotos de las sugerencias aprobadas. Los créditos de las fotos
(`creditos.json`) no cambian: los enlaces de ahí son la atribución que exige
la licencia, no la foto que se muestra.

## 12. Actividad y notificaciones se guardaban para siempre

**Pregunta del equipo:** si el Home muestra las últimas 5 actividades, ¿se
borra la sexta? **No:** nada borraba `actividad_hogar` ni las notificaciones
(salvo las que el usuario elimina a mano). Al momento: 96 filas de actividad
(la más vieja del 9/9/2026, 80 kB) y 3 notificaciones; no era un problema de
espacio todavía, pero crecían sin límite.

**Decisión del equipo (no se borra todo lo que pase de 5, para no perder
historial):**
- `actividad_hogar`: se borra lo que tenga **más de 90 días** o quede fuera
  de las **últimas 150 de su hogar**.
- `notificaciones`: se borran las **ya leídas** con **más de 60 días**
  (contados desde que se crearon: no se guarda cuándo se leyó). Las no
  leídas no se tocan.

**Solución:** migración
[20261015120000_limpieza_actividad_y_notificaciones.sql](../supabase/migrations/20261015120000_limpieza_actividad_y_notificaciones.sql)
(ya aplicada): función `limpiar_datos_viejos()` y job de pg_cron
`limpiar-datos-viejos` todos los días a las 06:00 UTC (03:00 de Argentina),
más un índice `(hogar_id, created_at desc)` para el "últimas 150". Nadie la
puede ejecutar desde la app. Corrida una vez a mano para verificarla:
devolvió `{actividad: 0, notificaciones: 0}` (correcto: hoy no hay nada tan
viejo) y la actividad siguió con sus 96 filas. `get_advisors`: sin hallazgos
nuevos. Para ver qué borraría, se puede correr
`select public.limpiar_datos_viejos();` desde el SQL editor (devuelve cuántas
filas borró de cada tabla).

Borrar una notificación de vencimiento vieja no hace que se repita: el job de
vencimientos solo avisa de productos dentro de su ventana de aviso o vencidos
hace menos de una semana, mucho menos que 60 días.

## 13. Repartir la app para probar: APK independiente, web y actualizaciones

**Pedido del equipo:** una APK que funcione sin `npx expo start` en una
compu, una forma de que la prueben con iPhone, y que las actualizaciones les
lleguen sin volver a descargar.

**Hallazgo:** el `.env` (URL y key pública de Supabase) está en `.gitignore`,
así que EAS no lo sube al armar en la nube: una APK independiente quedaba sin
saber a qué base conectarse (con el development build no se notaba, porque
el código lo sirve la compu que sí tiene el `.env`). Se resuelve cargando
esas dos variables en EAS (environment `preview`).

**Cambios:** perfil `preview` de `eas.json` con `buildType: apk`,
`environment` y `channel`; **EAS Update** (`expo-updates`, `runtimeVersion`
con política `appVersion`, `updates.url`) para mandar cambios de código por
aire; `web.output: single` para publicar la versión web con EAS Hosting.
`expo-doctor` 21/21. Paso a paso en
[guia-para-probar-la-app.md](guia-para-probar-la-app.md).

**A tener en cuenta:** solo las APK armadas **después** de este cambio
reciben actualizaciones por aire. Si se cambia algo nativo, subir `version`
en `app.json` y armar una APK nueva.

## 14. En el celular no se veían los botones de la fecha de vencimiento

**Síntoma (captura del equipo, versión web en un iPhone):** en "Agregar
producto", al lado del campo "Fecha de vencimiento" solo se veía un pedazo
del botón del calendario; la foto y el micrófono quedaban fuera de la
pantalla.

**Causa:** el campo de fecha y los tres botones (calendario, foto, voz)
estaban en una misma fila. En el navegador, un campo de texto tiene un
ancho mínimo propio aunque se le diga que se achique, así que en una
pantalla angosta empujaba los botones hacia afuera.

**Solución:** el campo ocupa todo el ancho y los tres botones van debajo,
**con texto** ("Calendario", "Foto", "Dictar"), repartidos en tercios
(`minWidth: 0` para que se achiquen). Además se agregó margen al final del
formulario para que el botón "Agregar producto" no quede tapado por la
barra del navegador.

**Lección:** en filas con un campo de texto y botones, probar a 375 px de
ancho (iPhone) y en la versión web: el navegador maneja los anchos de los
campos distinto que el celular nativo.

## 15. Acceso rápido "Escanear ticket" y ayuda con "?" (pedido del equipo)

- **Escanear ticket** en "Accesos rápidos" del Home: abre la despensa del
  hogar seleccionado con el escaneo ya abierto (parámetro `abrirTicket`,
  igual que "Cargar por voz" con `abrirVoz`). De paso, `handleIrAProductos`
  pasó a recibir un objeto con nombres en vez de varios true/false sueltos.
- **Ayuda** (botón "?" arriba a la derecha del Home, y en Cuenta →
  Ajustes): `AyudaScreen` con temas que se abren al tocarlos y un buscador.
  El texto vive en `src/ayuda/contenido.ts` y nombra cada botón con el
  mismo texto que se ve en la app (se revisaron los textos reales de los
  formularios antes de escribirla); `ayuda.test.ts` verifica que cada tema
  esté completo, que los íconos existan y el buscador.

**No probado en pantalla** (requiere login con Google): la ayuda, el acceso
rápido y la nueva fila de botones de la fecha; sí `tsc` y los tests.

## 16. Los cambios de otra persona no se veían hasta salir y volver a entrar

**Síntoma (reportado por el equipo):** si una persona agregaba un producto,
a otra del mismo hogar con la app abierta no se le actualizaba.

**Causa:** `productos` y `actividad_hogar` **no estaban en la publicación de
Realtime** (solo `hogar_miembros`, `notificaciones` y `usuarios`), y la
despensa y el inicio no se suscribían a cambios: solo recargaban al entrar.

**Solución:** migración
[20261016120000_realtime_productos_y_actividad.sql](../supabase/migrations/20261016120000_realtime_productos_y_actividad.sql)
(ya aplicada) y suscripciones en `ProductosScreen` (cambios de productos del
hogar; los DELETE no se pueden filtrar por hogar y solo traen el id, así que
se recarga si el borrado estaba en la lista) y en `HomeScreen` (cada cambio
genera una fila de actividad: se recargan la actividad y las alertas). Los
avisos seguidos —un ticket de 10 productos son 10 avisos— se agrupan en una
sola recarga (`agruparLlamadas` en `src/lib/tiempoReal.ts`), y la recarga es
silenciosa (sin spinner). Realtime respeta las policies de SELECT: cada uno
recibe solo cambios de sus hogares (verificado que existen para miembros).

## 17. La pantalla gris al tocar la lupa (buscar)

**Síntoma (reportado por el equipo, versión web en iPhone):** al tocar la
lupa de la barra de abajo, la pantalla quedaba gris y había que cerrar y
volver a abrir.

**Investigación:** no se pudo reproducir (requiere login). Dos causas
probables, y se corrigieron las dos:
1. El buscador se enfocaba con `autoFocus` **durante** la animación de
   entrada de la pantalla. En Safari de iPhone, enfocar un campo mientras la
   pantalla se está moviendo hace que el navegador desplace la página para
   mostrar el teclado y puede dejar a la vista solo el fondo. Ahora se enfoca
   recién después de la animación (450 ms).
2. Si cualquier pantalla falla al dibujarse, React deja la pantalla vacía
   (gris en modo oscuro). Se agregó `RedDeSeguridad` (error boundary) alrededor
   de toda la app: muestra "Algo salió mal" con "Reintentar" y deja el error
   en la consola.

**Pendiente:** si vuelve a pasar, con la red de seguridad ahora debería verse
el aviso en vez de la pantalla gris; si se ve el aviso, anotar qué se estaba
haciendo para encontrar el error exacto.

## 18. Los términos quedaban en pantalla después de aceptarlos (primer login)

**Síntoma (le pasó al equipo 3 veces):** al iniciar sesión por primera vez,
la pantalla de Términos y Condiciones no se cerraba; había que cerrar la app.

**Investigación:** en la base la aceptación **sí** se registraba (la cuenta
creada a las 00:20:53 tiene `terminos_aceptados_at` 00:20:56): el problema era
de la pantalla.

**Causa (dos errores):**
1. Al iniciar sesión, `AuthContext` pide el perfil varias veces seguidas
   (sesión inicial, login, renovación del token). Si una respuesta **vieja**
   llegaba después de la nueva, pisaba el perfil actualizado y volvía a decir
   "no aceptó los términos".
2. En `RootNavigator`, el "cargando" de registrar la aceptación solo se
   apagaba si el efecto no se había cancelado; como aceptar cambia el estado
   (y eso cancela el efecto), podía quedar encendido para siempre.

**Solución:** "gana el último pedido" (`src/lib/ultimoPedido.ts`): se ignora
cualquier respuesta del perfil que no sea la del pedido más nuevo; y el
"cargando" se apaga siempre (`finally`). Tests en `tiempoReal.test.ts`.

**Lección:** cuando la misma consulta se dispara varias veces seguidas, hay
que descartar las respuestas viejas: no llegan necesariamente en orden.

## 19. `eas update` fallaba en Windows: el compilador de Hermes bloqueado

**Síntoma:** `npx eas-cli update ...` terminaba con *Failed to generate Hermes
bytecode* / *Error: spawn UNKNOWN*.

**Causa:** al ejecutar `hermesc.exe` directo, Windows respondió *"Una
directiva de Control de aplicaciones bloqueó este archivo"*: **Smart App
Control** de Windows 11 bloquea ese ejecutable (descargado al actualizar
Expo). No es un error del código: el build de la APK en los servidores de
Expo funcionó porque no corre en esta compu.

**Solución (sin tocar la configuración de seguridad de Windows):** exportar
el paquete de Android **sin bytecode de Hermes** (`--no-bytecode`; Hermes
también ejecuta el código sin compilar, la app solo tarda un poco más en
abrir) y subirlo ya armado con `eas update --skip-bundler`. Quedó como
`npm run publicar:app -- --message "..."` (ver la guía). Alternativas: correr
`eas update` desde otra compu, desde WSL (Linux) o desde un servicio de CI.

## 20. `eas deploy --prod` falló al "promover" la versión web

**Síntoma:** la subida terminaba bien (`Created deployment`, 100 %) pero
fallaba *"Failed to promote deployment to production — Unexpected server
error"*.

**Causa:** error del lado de los servidores de Expo (la respuesta no trae
más detalle). La versión quedó subida, pero no se pasó a la dirección
principal.

**Solución:** reintentar `npx eas-cli deploy --prod` (o `npm run
publicar:web`), o promover esa versión desde expo.dev → Hosting →
Deployments.

**Lo que se vio después (2026-10-11, al publicar desde Claude):** un
`deploy --prod` dijo "Promoted deployment to production" pero la dirección
principal siguió entregando la versión anterior más de 3 minutos; reasignarla
con `npx eas-cli deploy:alias --prod --id <id de la publicación>` respondió
*otra vez* "Unexpected server error", pero a los pocos segundos la dirección
principal ya entregaba la versión nueva. O sea: **el mensaje de Expo no es
confiable; hay que verificar qué se está sirviendo.** Para verificar, comparar
el nombre del archivo `index-….js` que aparece en `dist/index.html` con el que
entrega la página:
```bash
curl -s "https://hogarstocky.expo.app/?v=$RANDOM" | grep -o 'index-[a-f0-9]*\.js'
```
Si no coinciden, esperar un minuto y reintentar el `deploy:alias`.

## 21. La voz cargaba "1 paquete de sal" como 1 kg y el pimentón como 1 g

**Síntoma:** por voz, "paquetes de chocolatada" quedaban en litros, "un
paquete de sal" como 1 kg y "un paquete de pimentón" como 1 g.

**Causa raíz:** en `armarAccion` (`src/services/voz.ts`) un alta tomaba
**siempre la unidad del catálogo** cuando el producto estaba ahí
(Chocolatada en l, Sal en kg, Pimentón en g) y la unidad dicha solo se usaba
para lo que no estaba en el catálogo. Además, el prompt de `voz-a-texto` solo
pedía unidades de peso/volumen, así que "paquete", "caja" o "sobre" no se
traducían a nada.

**Solución:** `unidadDeAlta`: la unidad dicha manda; sin unidad dicha se usa
la del catálogo, salvo g/ml, que pasan a `paquete` con un aviso. El prompt
ahora traduce envases (paquete, caja, bolsa, sobre, frasco) a `paquete` con
la cantidad de envases, y la revisión deja cambiar la unidad con chips.
Tests en `voz.test.ts`.

**Junto con esto (pedido nuevo):** lo que no es comida ("shampoo") ya no se
pierde (el prompt antes descartaba lo que "no es de la despensa"): llega con
`es_alimento: false`, se muestra con aviso y se carga solo con "Cargar
igual".

**Ojo:** la parte del prompt necesita volver a desplegar la Edge Function
`voz-a-texto`; sin eso, la app igual respeta la unidad cuando el modelo la
devuelve y deja corregirla a mano.

## 22. Chocolatada en litros y en paquete se sumaban en un solo producto

**Síntoma:** cargar "1 litro de chocolatada" y después "1 paquete de
chocolatada" (líquida y en polvo) dejaba un solo producto con "2 l", en vez
de dos productos distintos. Pasaba por voz, a mano y por ticket.

**Causa raíz:** al crear un producto, `crearProducto` busca uno "idéntico"
para sumarle la cantidad en vez de repetir la fila (`buscarDuplicado`), y
comparaba catálogo/nombre, marca y vencimiento, pero **no la unidad**. Hasta
el arreglo de la voz (#21) casi no aparecía, porque todo lo del catálogo se
cargaba siempre en la unidad del catálogo.

**Solución:** `buscarDuplicado` también exige la misma unidad. La lista de
la despensa ya separaba por unidad (`agruparProductos` agrupa por nombre +
unidad), así que se ven como dos productos: "Chocolatada · 1 l" y
"Chocolatada · 1 paquete". Test en `productos.test.ts`. La base no tiene
ninguna restricción que las junte (verificado), no hizo falta migración.

## 23. Web: después de "Continuar con Google" quedaban los términos sin salida

**Síntoma:** en la versión web (computadora e iPhone), después de elegir la
cuenta de Google la app mostraba otra vez los Términos y Condiciones (con la
flecha de "volver", o sea la versión de *antes* del login) y no había forma
de entrar.

**Causa raíz:** en la web, `signInWithGoogle` abría Google en una **ventana
emergente** (`WebBrowser.openAuthSessionAsync`), que al terminar tenía que
devolverle la sesión a la pestaña original con `postMessage` y cerrarse sola
(`maybeCompleteAuthSession`). Al pasar por Google, el navegador corta el
vínculo entre las dos ventanas (`window.opener` queda vacío por las políticas
de seguridad de Google), así que la emergente no se cerraba: cargaba la app
entera en `/auth/callback`, **sin sesión** (en la web `detectSessionInUrl`
estaba apagado), y mostraba las pantallas de antes del login. En el iPhone
la emergente es otra pestaña, así que uno quedaba atrapado ahí.

**Solución:** en la web el login usa una **redirección en la misma
pestaña** (`signInWithOAuth` sin `skipBrowserRedirect`): va a Google y vuelve
a `https://hogarstocky.expo.app/auth/callback#access_token=...`, y
supabase-js toma la sesión de la URL (`detectSessionInUrl: true` solo en
web, `lib/supabase.ts`). En el celular sigue igual (navegador de la app +
deep link `stocky://`). Test en `auth.test.ts`. Verificado en el navegador
que la pestaña va directo a Google, sin ventana emergente (el login completo
necesita una cuenta de Google, queda para QA).

**Requisito:** la dirección de vuelta tiene que estar en Supabase →
Authentication → URL Configuration → Redirect URLs. Ya están
`https://hogarstocky.expo.app/**` y `https://hogarstocky--*.expo.app/**`
(guía para probar la app, sección 2).

## 24. Panel admin → Catálogo: categorías gigantes y sin foto

**Síntoma:** en la web, los botones de categoría de Admin → Catálogo se
veían como columnas altísimas que ocupaban media pantalla, y al corregir un
producto no se podía ver ni cambiar su foto.

**Causa raíz:** (1) en react-native-web, un `ScrollView` horizontal dentro de
una columna crece para ocupar todo el alto libre (`flexGrow` por defecto), y
los chips se estiraban con él. (2) El formulario simplemente no tenía la
parte de la foto; además, la app mostraba siempre primero la foto guardada
dentro de la app (`assets/catalogo`), así que aunque se cambiara
`imagen_url` en la base no se hubiera visto.

**Solución:** `flexGrow: 0` en las filas de chips. El formulario del catálogo
muestra la foto actual y permite elegirla de la galería, sacarla con la
cámara o quitarla (`cambiarFotoCatalogo` / `quitarFotoCatalogo` en
`services/admin.ts`, carpeta `catalogo/` del bucket, permiso solo para
admins en la migración `20261018130000_fotos_catalogo_admin.sql`). Ahora una
foto **subida a Stocky** le gana a la guardada en la app
(`imagenDeCatalogo`); las direcciones externas viejas siguen perdiendo. Los
cambios de foto quedan en el registro de acciones. Tests en `admin.test.ts`
y `catalogoImagenes.test.ts`.

## 25. "No funciona la carga por voz" (Google saturado)

**Síntoma:** la carga por voz fallaba siempre con "No pudimos entender el
audio en este momento" (13/10/2026 al mediodía).

**Causa raíz:** no era la app. En los logs de `voz-a-texto` los tres modelos
de Gemini fallaban a la vez: `gemini-3.5-flash` y `gemini-3.8-flash`
respondían **503 "This model is currently experiencing high demand"** y
`gemini-3.5-flash-lite` tardaba más de los 15 s de límite por intento. El día
anterior los mismos modelos respondían (uno en 11,9 s). Es saturación del lado
de Google, que va y viene.

**Solución (para aguantar mejor esos picos):** en `_shared/gemini.ts`, (1) si
TODOS los modelos fallan por saturación, se espera 3 s y se hace una
**segunda vuelta** antes de rendirse; (2) el límite por intento subió de 15 a
**25 s**; (3) `voz-a-texto` y `vencimiento-foto` ahora dicen claramente
"El servicio de Google está saturado, probá en unos minutos o cargalo a
mano" (503) en vez de "no pudimos entender el audio". Desplegadas
`voz-a-texto` v7 y `vencimiento-foto` v9. Tests en `geminiRespaldo.test.ts`.
En el peor caso ahora se espera ~1 minuto antes del aviso.

**Si vuelve a pasar seguido:** probar otros modelos sin tocar código con el
secret `GEMINI_MODEL` (lista separada por comas) en Supabase → Edge
Functions → Secrets, o pasar a un plan pago de Gemini (más prioridad).

## 26. Web: "This deployment is receiving too many requests"

**Síntoma:** al abrir `https://hogarstocky.expo.app` aparecía la página de
EAS Hosting "Too Many Requests — This free-tier deployment has temporarily
exceeded its request rate limit". A los pocos minutos volvía sola.

**Causa raíz:** el plan gratuito de EAS Hosting limita cuántos pedidos por
segundo recibe la página. La lista de "Agregar producto"
(`CatalogoSelectorModal`) y la de Admin → Catálogo dibujaban el catálogo
completo con `ScrollView` + `map`: al abrirlas se pedían **las ~270 fotos de
una vez** (en la web cada foto es un pedido aparte a la misma página). Con
un par de personas probando, más los chequeos automáticos después de cada
publicación (un pedido cada 10 s), se pasaba el límite.

**Solución:** las dos listas pasaron a `FlatList` (`initialNumToRender` 15,
`windowSize` 5): solo se dibuja y se pide la foto de lo que está a la vista
y lo que se va acercando al scrollear. Los chequeos después de publicar ahora
consultan cada 30 s. Si con más usuarios vuelve a pasar, las opciones son el
plan pago de EAS Hosting o servir las fotos desde Supabase Storage.
