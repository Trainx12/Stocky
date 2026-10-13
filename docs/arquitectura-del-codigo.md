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
autenticación y las Edge Functions de OCR/voz). La
seguridad de "quién puede ver/tocar qué dato" no vive en la app —
vive en la base de datos, en forma de **RLS (Row Level Security)**. Esto
es importante tenerlo claro: la app confía en que Postgres va a
rechazar cualquier consulta que no corresponda, así que ninguna pantalla
necesita "acordarse" de filtrar por hogar a mano.

```
App (Expo)  ──consultas──>  Supabase
   │                          ├─ Auth (login con Google)
   │                          ├─ Postgres (tablas + RLS)
   │                          └─ Edge Functions (OCR.space y Gemini: ticket, vencimiento, voz)
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

**Modo oscuro (Sprint 10) — regla para todo componente nuevo:**
`colors.ts` tiene dos juegos de valores con los mismos nombres (claro y
oscuro). `colors` es un objeto cuyos valores cambia `aplicarEsquema()` al
pasar de un modo al otro (lo llama `context/TemaContext.tsx`, que guarda la
elección del usuario en el celular: sistema / claro / oscuro). Por eso:

1. Los estilos se definen como **función** y se usan con el hook
   `useEstilos` (`theme/useEstilos.ts`), que los vuelve a armar al cambiar
   el modo:
   ```tsx
   export function MiPantalla() {
     const styles = useEstilos(crearEstilos);
     ...
   }
   const crearEstilos = () => StyleSheet.create({ ... });
   ```
   Un `const styles = StyleSheet.create(...)` a nivel de módulo se quedaría
   con los colores del modo en que arrancó la app.
2. Nunca guardar un color en una constante de módulo
   (`const X = { color: colors.primary }`): usar una función que se lea en
   cada render (ver `estiloPorTipo` en `AvisosHost`).
3. `colors.white` se mantiene blanco en los dos modos (es el texto sobre
   botones de color); para fondos usar `colors.surface`/`colors.background`.

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

## 4bis. `src/lib/alert.ts` — diálogos cross-platform

`Alert.alert()` de React Native es un no-op en `react-native-web` (ver
[docs/incidentes-sprint3.md](incidentes-sprint3.md) #1): no muestra nada
ni dispara ningún botón ahí. Este archivo expone `avisar()` (mensaje de un
botón) y `confirmar()` (sí/no, devuelve `Promise<boolean>`), que en nativo
usan `Alert.alert` real y en web usan `window.alert`/`window.confirm`.
**Ninguna pantalla o componente debería importar `Alert` de `react-native`
directo** — siempre pasar por estos dos helpers.

**Desde el Sprint 10 (cartelitos propios):** `App.tsx` monta
`components/AvisosHost.tsx`, que se registra en este archivo
(`registrarHostDeAvisos`). Con el host montado, `avisar()` muestra un
cartelito arriba de la pantalla con el diseño de la app (verde si salió bien,
coral si falló, violeta si es informativo; se va solo) y `confirmar()` un
diálogo propio (botón coral si la acción borra o saca algo). La firma no
cambió: las pantallas siguen llamando igual. El tipo se deduce del título
(`tipoDeAviso`) o se pasa explícito: `avisar(titulo, mensaje, 'exito')`. Sin
host (tests), se usa el comportamiento de antes.

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
`hogares_update_dueno_o_permitido_o_admin` (ver
[20260828120000_permisos_editar_hogar.sql](../supabase/migrations/20260828120000_permisos_editar_hogar.sql))
ya exige ser dueño, o invitado con el permiso habilitado, o admin, así
que no hace falta duplicar esa validación en el cliente.

**Jerarquía dueño/invitado** (ver
[supabase/migrations/20260827140000_hogares_jerarquia.sql](../supabase/migrations/20260827140000_hogares_jerarquia.sql)):
`hogar_miembros.rol` es `'dueno'` (quien creó el hogar, vía `crear_hogar`)
o `'invitado'` (quien se sumó por código, vía `unirse_a_hogar`).
`listarMisHogares()` devuelve ahora `HogarConRol[]` (el rol del usuario
logueado EN CADA hogar — puede ser dueño de uno e invitado de otro).
`listarMiembrosDeHogar(hogarId)` trae todos los miembros de un hogar
puntual con su rol y nombre/email (join a `usuarios`), para la pantalla
"Miembros del hogar". `expulsarMiembro(hogarId, usuarioId)` es la única
forma de sacar a OTRO usuario de un hogar (a diferencia de
`salirDeHogar`, que es uno mismo yéndose voluntariamente): la RPC
`expulsar_miembro` en Postgres exige que quien llama sea el dueño y
rechaza explícitamente expulsarse a uno mismo o al dueño — dos guardas
independientes, a propósito redundantes, para que el dueño de un hogar
nunca pueda ser expulsado por nadie.

**Editar el nombre del hogar es solo del dueño por default** (ver
[20260828120000_permisos_editar_hogar.sql](../supabase/migrations/20260828120000_permisos_editar_hogar.sql)):
antes cualquier miembro podía renombrar el hogar; ahora `hogar_miembros`
tiene una columna `puede_editar` (default `false`) que el dueño puede
habilitar por invitado puntual con `permitirEditarHogar(hogarId,
usuarioId, permitir)`. `listarMisHogares()` calcula `puedoEditar` (dueño
`OR` `puede_editar`) para que `HomeScreen` sepa si mostrar el lápiz de
editar; `listarMiembrosDeHogar()` expone `puedeEditar` por miembro para el
switch de `HogarMiembrosModal`.

**Actualización inmediata al expulsar** (mismo archivo de migración,
habilita Realtime en `hogar_miembros`): quien expulsa ya ve el cambio al
instante porque es su propia acción (recarga el modal después del RPC),
pero el usuario expulsado no se enteraba hasta recargar la app a mano.
`HomeScreen` se suscribe con `supabase.channel(...).on('postgres_changes',
{ event: 'DELETE', table: 'hogar_miembros', filter: 'usuario_id=eq.<mi
id>' }, ...)`: si mi propia fila se borra (me expulsaron de algún hogar),
refresca `misHogares`/`usuario` al toque y avisa.

**El dueño acepta o rechaza a quien se quiere unir** (ver
[20260903120000_solicitudes_hogar.sql](../supabase/migrations/20260903120000_solicitudes_hogar.sql)):
`unirseAHogar()` ya NO suma como miembro directo -- `hogar_miembros` ahora
tiene una columna `estado` ('pendiente' | 'aprobado'), y unirse por código
crea la fila en 'pendiente'. `es_miembro_de()` exige `estado = 'aprobado'`,
así que mientras la solicitud esté pendiente ese usuario no ve productos,
nombre del hogar ni al resto de los miembros -- recién al ser aceptado pasa
a ser miembro de verdad (y recién ahí, si no tenía hogar activo, se le
asigna). `responderSolicitud(hogarId, usuarioId, aprobar)` es la única
forma de resolver una solicitud (RPC `responder_solicitud`, solo el dueño
puede llamarla, mismo patrón de guarda que `expulsarMiembro`): aceptar pasa
la fila a 'aprobado'; rechazar la borra directamente (el usuario puede
volver a intentar con un código más adelante).
`listarSolicitudesPendientes(hogarId)` (para el dueño, en "Miembros del
hogar") y `listarMisSolicitudesPendientes()` (para quien mandó la
solicitud, en "Solicitudes que enviaste" de `HomeScreen`) muestran cada
lado del mismo estado -- esta última va por RPC (`listar_mis_solicitudes_
pendientes`, SECURITY DEFINER) porque mientras la solicitud está pendiente
la policy de SELECT de `hogares` todavía no lo deja ver el nombre del
hogar por su cuenta.

La tabla tiene `REPLICA IDENTITY FULL` (en vez del default, que solo manda
la primary key en el "old record" de Realtime): así `HomeScreen` puede
distinguir, al recibir un cambio sobre su propia fila, si fue "me
aceptaron" (UPDATE pendiente→aprobado), "me rechazaron" (DELETE con estado
anterior 'pendiente') o "me expulsaron" (DELETE con estado anterior
'aprobado') -- son tres mensajes distintos para el mismo evento de
Realtime, y sin el estado anterior no se podían diferenciar.

**El hogar nunca queda sin dueño** (ver
[20260907120000_ceder_dueno_y_cancelar_solicitud.sql](../supabase/migrations/20260907120000_ceder_dueno_y_cancelar_solicitud.sql)):
antes, si el dueño se iba (`salirDeHogar`), el hogar se quedaba sin ningún
miembro con `rol = 'dueno'` y, como `responderSolicitud`/`expulsarMiembro`/
`permitirEditarHogar` exigen serlo, las solicitudes pendientes de ese hogar
quedaban trabadas para siempre y nadie podía volver a unirse. Ahora
`salir_de_hogar()` promueve a otro miembro ANTES de borrar la fila del que se
va: primero al invitado aprobado más antiguo; si no queda ninguno, a la
solicitud pendiente más antigua (aprobándola de paso). `cederDueno(hogarId,
usuarioId)` es la versión voluntaria de lo mismo -- el dueño elige a quién
pasarle el rol sin tener que irse del hogar -- con la misma guarda que
`expulsarMiembro` (solo el dueño puede llamarla, del lado de la RPC).

**Cancelar una solicitud propia no necesita RPC**: `cancelarSolicitud(hogarId)`
hace un `.delete()` directo sobre la propia fila en estado `'pendiente'` --
alcanza con la policy `hogar_miembros_delete_propio_o_admin` que ya existía
(deja borrar cualquier fila propia sin importar el estado, ver migración
20260826130000_hogares_multi_membresia.sql), así que no hace falta una
función nueva del lado de Postgres solo para esto.

**No se puede "volver a unir" a un hogar del que ya se es miembro** (mismo
archivo de migración): `unirse_a_hogar()` solo tenía un `on conflict (hogar_id,
usuario_id) do nothing` para evitar duplicar la fila, pero no avisaba nada --
alguien ya aprobado (o con una solicitud pendiente) en ese hogar podía volver
a mandar el código y la función devolvía éxito igual, mostrando "Solicitud
enviada" sin haber pasado nada de verdad. Ahora valida el estado actual ANTES
de intentar el insert y rechaza con un mensaje explícito (`Ya sos miembro de
este hogar` / `Ya tenés una solicitud pendiente para este hogar`); el `on
conflict do nothing` queda solo como red de seguridad ante una carrera entre
dos llamadas simultáneas.

### `productos.ts` — ABM de productos de un hogar (RF7)

A diferencia de `hogares.ts`, acá no hay ninguna RPC: `crearProducto`,
`editarProducto` y `eliminarProducto` son un `.insert()`/`.update()`/
`.delete()` directo contra `productos`, porque cada operación toca una
sola fila de una sola tabla -- la policy de RLS
(`productos_insert_propio_hogar_o_miembro` y las de update/delete/select,
ver
[20260826130000_hogares_multi_membresia.sql](../supabase/migrations/20260826130000_hogares_multi_membresia.sql))
ya exige ser miembro del hogar (`hogar_id_actual()` o
`es_miembro_de(hogar_id)`) o admin, mismo criterio que `editarHogar()`.

`listarProductos(hogarId)` filtra explícito por `hogar_id` -- no alcanza
con dejar que la RLS filtre sola, porque esa misma policy le da acceso a
**todos** los hogares a una cuenta admin (`es_administrador()`); sin el
`.eq()` esta pantalla podría devolver mezclado el inventario de otro
hogar si la llamara un admin (mismo patrón de bug que
`listarMisHogares`, ver [incidentes-sprint2.md](incidentes-sprint2.md) #2).

Validación de datos (nombre/categoría vacíos, cantidad/stock mínimo
negativos) se hace del lado del cliente ANTES de pegarle a Supabase
(función interna `validar()`), para no depender de un constraint de base
que todavía no existe y para que el error sea legible al toque, sin
round-trip. La categoría es obligatoria a propósito -- sin eso el filtro
por categoría de `ProductosScreen` pierde sentido -- aunque la columna
`productos.categoria` en la base sigue siendo nullable (hay una fila
vieja, de antes de esta regla, sin categoría cargada).

**Vencimiento de productos** (RF2/RF3, Sprint 4): `fecha_vencimiento`
(texto libre `AAAA-MM-DD`, cargado a mano o con el calendario -- ver
`CalendarioPicker` abajo -- desde `ProductoFormModal`) y
`alerta_vencimiento_habilitada` (switch en el mismo modal, default `true`
como la columna) ya se mandan desde `crearProducto`/`editarProducto`;
`validar()` rechaza una fecha con formato o valor inválido
(`esFechaValida` compara contra los componentes numéricos, no contra el
string, porque `Date` "corrige" fechas imposibles como el 30 de febrero
en vez de rechazarlas) antes de pegarle a Supabase, mismo criterio que
nombre/categoría/cantidad. `formatearFechaInput()` es la lógica del
auto-guionado (el usuario solo tipea dígitos, los `-` se insertan solos,
incluso al borrar) que usa el campo de texto; `formatearFechaISO()` es la
inversa (`Date` → `'YYYY-MM-DD'`, con componentes LOCALES, no
`toISOString()`) que usa `CalendarioPicker` para volcar el día tocado al
mismo campo.

**`src/components/CalendarioPicker.tsx`**: calendario en grilla (mes +
flechas para navegar + cuadrícula de días, con el día de hoy resaltado)
construido a mano con componentes de React Native -- no una librería de
date picker (se probó `@react-native-community/datetimepicker`, pero esa
librería **no soporta web**, dibuja el selector nativo del sistema
operativo en vez de algo estilable, y en este caso puntual el equipo pidió
justamente que se viera como una grilla igual en cualquier plataforma). Se
embebe inline debajo del campo de fecha en `ProductoFormModal` (se
expande/colapsa con el botón de calendario, mismo patrón que
"categoriaPersonalizada" del propio modal) en vez de ser un popup
flotante, más simple de armar dentro de un modal que ya scrollea.
`diasDelMesCalendario(anio, mesIndiceCero)` (en `productos.ts`) arma la
grilla de 42 días (6 semanas, arrancando el lunes, con relleno de los
meses lindantes) como lógica pura testeable, separada del componente.

`estadoVencimiento(producto, hoy?)` es la única fuente de verdad de "está
por vencer" (`'ok' | 'proximo' | 'vencido' | null`, con `null` cuando no
corresponde alertar: sin fecha cargada, o alerta deshabilitada a
propósito): la usan tanto `ProductosScreen` (badge por fila) como
`HomeScreen` (dashboard). `DIAS_PROXIMO_A_VENCER` (7 días) vive ahí como
único umbral, para no tener que sincronizarlo entre pantallas si cambia.
`etiquetaVencimiento()` arma el texto legible ("Vence hoy"/"Vence en N
días"/"Vencido hace N días") a partir del mismo estado, pero por separado
-- el color del badge lo decide cada pantalla con `colors.stockStatus`
(ver `src/theme/colors.ts`), este servicio no importa nada de theme.

`listarProductosProximosAVencer(hogarIds)` trae los candidatos de varios
hogares a la vez (los del usuario logueado, pasados explícitos por
`HomeScreen` desde `listarMisHogares()`) y les aplica
`productosProximosAVencer()` -- mismo patrón de "filtrar explícito en vez
de confiar solo en la RLS" que `listarProductos`, porque un admin ve todos
los hogares vía `es_administrador()`.

### `actividad.ts` — "Actividad reciente" de HomeScreen

`listarActividadReciente(hogarId, limite)` es la única función acá, y va
por RPC (`listar_actividad_reciente`, ver
[20260907130000_actividad_hogar.sql](../supabase/migrations/20260907130000_actividad_hogar.sql))
en vez de un select directo a `actividad_hogar` porque el autor de una fila
(`usuario_id`) puede ser `null` (cuenta borrada) y ese join opcional
usuario/actividad es más simple de resolver del lado de Postgres que con el
select anidado de PostgREST. Las filas de `actividad_hogar` no las inserta
nada del cliente: las genera un trigger `AFTER INSERT OR UPDATE OR DELETE`
sobre `productos` (`registrar_actividad_producto()`, `SECURITY DEFINER` por
el mismo motivo que los helpers de RLS) -- así ninguna función de
`productos.ts` tiene que acordarse de loguear a mano, ni hay riesgo de que
alguien agregue un producto por afuera de ese archivo y la actividad quede
sin registrar. Hoy solo cubre ABM de productos (lo único con ABM real);
altas/bajas de `hogar_miembros` todavía no generan actividad.

**Limpieza automática (Sprint 10):** un job diario (`limpiar_datos_viejos`,
pg_cron, 03:00 de Argentina) borra la actividad de más de 90 días o fuera de
las últimas 150 de cada hogar, y las notificaciones ya leídas de más de 60
días. Ver [incidentes-sprint10.md](incidentes-sprint10.md) #12.

**Catálogo de productos** (ver migración
[20260909212018_catalogo_productos.sql](../supabase/migrations/20260909212018_catalogo_productos.sql)):
`crearProducto`/`editarProducto` ahora reciben también `catalogoId` (de
qué fila de `productos_catalogo` salió), que se guarda en
`productos.catalogo_id` (nullable, para no romper productos viejos de
antes del catálogo). `nombre`/`categoria`/`unidad` siguen siendo columnas
propias de `productos` (no un join permanente contra el catálogo) -- se
copian del catálogo al elegir, no se referencian en vivo, así el resto
de las queries (`listarProductos`, `ProductosScreen`, etc.) no tienen que
cambiar.

### `catalogo.ts` — catálogo global de productos (pedido directo del equipo)

**Orden del selector** (`ordenarParaCargar` / `categoriasParaCargar`):
primero los básicos de cocina (`BASICOS_DE_COCINA`: fideos, arroz, harina,
azúcar, leche...), después el resto por categoría de más a menos "de cocina"
(`PRIORIDAD_CATEGORIAS`, con Bebidas al final) y, al buscar, primero lo que
empieza con lo escrito. Para cambiar el orden alcanza con editar esas dos
listas. El panel de admin sigue mostrando el catálogo alfabético.

Cargar un producto en un hogar ya no es texto libre: se elige de un
catálogo GLOBAL (no es por hogar, lo comparten todos) en
`productos_catalogo`, con nombre/categoría/unidad ya cargados y espacio
para una foto (`imagen_url`, hoy `null` en toda la semilla -- ver
[incidentes-sprint4.md](incidentes-sprint4.md) #2). Si el producto que
alguien busca no está, puede sugerirlo (`sugerirProducto`) en vez de
cargarlo directo -- queda `estado = 'pendiente'` hasta que un admin lo
apruebe (`responderSugerencia`, ver `AdminSugerenciasScreen` más abajo) o
lo rechace (se borra la fila, sin dejar un estado "rechazado").

Mismo patrón que `productos.ts`: sin RPCs, `.insert()`/`.update()`/
`.delete()` directo contra `productos_catalogo`, porque cada operación
toca una sola fila de una sola tabla. La policy de INSERT fuerza
`sugerido_por = auth.uid()` y `estado = 'pendiente'` (nadie puede
auto-aprobarse ni sugerir "a nombre de" otro usuario); las de
UPDATE/DELETE exigen `es_administrador()`. Un índice único sobre
`lower(nombre)` evita duplicados tipo "Leche" / "leche" si dos personas
sugieren lo mismo o un admin aprueba sin fijarse.

**Sugerir con foto (Sprint 8):** `sugerirProducto` acepta una foto
opcional (`fotoBase64`). Se sube primero al bucket público de Storage
`catalogo-sugerencias`, en la carpeta del usuario (`<auth.uid()>/<fecha>.jpg`),
y la sugerencia guarda su URL pública en `imagen_url`; si después falla el
alta, se borra la foto. La policy de INSERT exige que esa URL sea de la
carpeta propia en ese bucket (nada de enlaces externos). Al rechazar,
`responderSugerencia` borra también la foto (`rutaDeFotoSugerencia` saca la
ruta de la URL); al aprobar, queda como foto del producto en el catálogo
(`imagenDeCatalogo` usa `imagen_url` cuando no hay foto local). Ver
migración `20260916120000_fotos_sugerencias.sql` e
[incidentes-sprint8.md](incidentes-sprint8.md) #4 y #5.

Para que se encuentre: pie fijo "¿No encontrás tu producto? Sugerilo" en
`CatalogoSelectorModal` y acceso rápido "Sugerir producto" en HomeScreen
(abre el modal con `soloSugerir`).

`categoriasDelCatalogo()`/`filtrarCatalogo()` son la misma lógica pura
(sacada para poder testearla con Jest) que `categoriasEnUso()`/
`filtrarProductos()` en `productos.ts`, aplicada al catálogo en vez de al
inventario de un hogar.

### `externalApis.ts` — wrappers de OCR/voz (RF4, RF8)

Una función por Edge Function (`reconocerProductosDeTicket`,
`reconocerVencimientoDeFoto`, `interpretarComandoDeVoz`,
`reconocerFechaPorVoz`). Ninguna guarda nada: devuelven lo que entendió
el proveedor y la pantalla lo muestra para que el usuario confirme.

### `voz.ts` + `lib/grabacion.ts` — ABM de productos por voz (RF8, Sprints 7/8)

`lib/grabacion.ts` (`useGrabadorDeVoz`) graba un mensaje corto con
`expo-audio` (tocar para empezar, tocar para terminar, corte a los 30 s)
y lo devuelve en base64: AAC en Android, WAV en iOS, WebM/MP4 en web.
`voz-a-texto` le manda el audio y el inventario del hogar a Gemini, que
transcribe e interpreta en una sola llamada (alta / baja / modificación,
cantidades, marca y fecha de vencimiento). `voz.ts` cruza esa respuesta
con el inventario y el catálogo (a qué producto se refiere, cantidad
final, fechas válidas) y, recién cuando el usuario confirma en
`ComandoVozModal`, aplica cada acción con las mismas funciones del ABM
manual (`crearProducto`/`editarProducto`/`eliminarProducto`). El mismo
grabador se usa en `ProductoFormModal` para dictar solo la fecha.

Reglas que conviene conocer: "sacá la leche" (sin cantidad) es una baja y
"sacá una leche" una resta; si lo dicho coincide con varios lotes
(`buscarProductosDichos`), una resta descuenta del que vence primero
(`ordenarLotes`) y una baja o un cambio de fecha piden elegir cuál. Nada se
guardado sin que el usuario confirme en la revisión.

Unidades (incidentes-sprint10.md #21): en un alta, **la unidad que dijo la
persona le gana a la del catálogo** (`unidadDeAlta`): "un paquete de sal" es
1 paquete aunque la Sal del catálogo esté en kg. Si no dijo unidad se usa la
del catálogo, salvo g/ml, que pasan a paquete (nadie compra "1 g de
pimentón"). El prompt de `voz-a-texto` le pide al modelo que traduzca envases
(paquete, caja, bolsa, sobre, frasco) a `paquete`, y en la revisión la unidad
de un alta se puede cambiar con chips. Lo que **no es comida** (`es_alimento:
false`, por ejemplo "shampoo") se muestra con aviso y sin marcar: se carga
solo si el usuario toca "Cargar igual" (`noEsAlimento`), con la categoría que
sugiere el modelo (`CATEGORIAS_VOZ`, que suma Limpieza e Higiene).

### Lotes agrupados en la lista (`agruparProductos`, Sprint 8)

En la base, el mismo producto con otra marca o vencimiento es otra fila
(un "lote"), a propósito: así la alerta de vencimiento de cada uno es
exacta. En `ProductosScreen` se muestran juntos: `agruparProductos` agrupa
por nombre normalizado + unidad (no mezcla kg con paquetes) y suma el total,
y cada producto es una tarjeta con franja violeta (nombre, categoría,
total) y sus lotes adentro, ordenados por `ordenarLotes` (vence antes
primero; sin fecha al final). Todos los productos se ven como tarjeta,
aunque tengan un solo lote. `filtrarProductos` busca también por marca.
Ver [incidentes-sprint8.md](incidentes-sprint8.md) #2 y #3.

### Alerta de stock mínimo y filtros de alertas (Sprint 9)

`productos.stock_minimo` se cargaba desde el Sprint 1 pero recién ahora
genera una alerta. Se evalúa **por producto** (el grupo de
`agruparProductos`), no por lote: `estadoStockDeGrupo` compara el total de
los lotes contra `stockMinimoDelGrupo` (el mayor mínimo cargado entre ellos).
`estadoStock(cantidad, minimo)` es la única fuente de verdad del umbral:
`'agotado'` (0 con mínimo), `'bajo'` (estrictamente menor al mínimo) o
`null` (sin mínimo cargado, o con stock suficiente). `etiquetaStock` arma el
texto; el color lo pone cada pantalla con `colors.stockStatus.low` (ámbar,
distinto del coral de vencimientos). `productosConStockBajo` /
`listarProductosConStockBajo(hogarIds)` hacen lo mismo para varios hogares a
la vez (dashboard), filtrando explícito por `hogarIds` como el resto de las
queries "mis X".

En `ProductosScreen`, el badge de stock va en el encabezado del producto
(calculado sobre el inventario completo, así buscar o filtrar no lo cambia),
y dos chips de filtro se combinan con la búsqueda y la categoría: **Por
vencer** (todos los lotes con fecha de vencimiento, aunque falte mucho o
tengan la alerta apagada, en el orden en que vencen, con
`productosConVencimiento`) y **Stock bajo** (solo los productos por debajo
del mínimo). `HomeScreen` sigue mostrando solo lo urgente
(`productosProximosAVencer`, las primeras 4 alertas de cada tipo) y un "Ver
todos" que abre `Productos` con `filtroInicial` ya aplicado.

**Hogar elegido y alcance de las alertas** (`services/preferenciasHogar.ts`):
el hogar elegido con "Cambiar hogar" se recuerda en el dispositivo
(AsyncStorage, por cuenta) y al volver a abrir la app o la web se sigue
mostrando (`elegirHogarInicial`: el recordado, si no `usuarios.hogar_id`, si
no el primero). Las alertas del inicio son **solo de ese hogar** por defecto;
la opción "Alertas de todos mis hogares" (pantalla Notificaciones) junta las
de todos (`hogaresDeLasAlertas`). Solo cambia lo que muestra el inicio: las
notificaciones de la campanita y el push siguen llegando de todos los
hogares, para no perder un aviso.

### Panel de administración (RF10 + RF9 completo) — `admin.ts`, `comentarios.ts`

Migración `20261018120000_panel_admin_comentarios_y_borrar_cuenta.sql`.

- **Pestaña "Admin"** (escudo en `BottomNavBar`, que lee el rol del
  `AuthContext` y solo la muestra a administradores) → `AdminScreen`:
  métricas arriba (`admin_metricas`, solo números agregados: usuarios,
  activos y nuevos en 30 días, hogares y hogares activos, productos en
  despensas y cargados en 30 días, catálogo, sugerencias pendientes, admins,
  cuentas deshabilitadas, comentarios) y abajo el menú de gestión: Usuarios
  (`AdminUsuariosScreen`), Sugerencias (`AdminSugerenciasScreen`), Catálogo
  (`AdminCatalogoScreen`), Comentarios (`AdminComentariosScreen`) y Registro
  (`AdminRegistroScreen`). Los accesos de admin que había en el inicio se
  sacaron (ahora viven acá).
- **Catálogo:** un admin agrega productos ya aprobados (policy
  `productos_catalogo_insert_admin`), corrige nombre/categoría/unidad y saca
  productos con `admin_sacar_del_catalogo`, que antes desvincula las
  despensas que lo usaban (no se les borra nada) sin anotarlo en su
  "Actividad reciente" (marca `stocky.sin_actividad` que respeta
  `registrar_actividad_producto`).
- **Registro de acciones** (`admin_registro`): lo escriben solo triggers
  (`registrar_cambio_catalogo`, `registrar_cambio_usuario`) cuando un admin
  aprueba/rechaza sugerencias, toca el catálogo, cambia un rol o
  habilita/deshabilita a alguien. Nadie puede insertar, editar ni borrar a
  mano; el mail del admin se guarda copiado por si la cuenta se borra.
- **Protecciones de roles** (trigger `proteger_roles`): la **cuenta
  principal** (`es_cuenta_protegida`, hoy `ruttyfacundo@gmail.com`) no puede
  perder el rol de admin ni ser deshabilitada por nadie, ni borrarse desde la
  app; y nunca se puede quedar la app sin admins (no se le quita el rol ni se
  deshabilita al último admin habilitado, ni puede borrar su cuenta). Para
  cambiar la cuenta principal hay que editar `es_cuenta_protegida` con una
  migración; `CUENTAS_PROTEGIDAS` en `admin.ts` es solo para esconder
  botones.
- **Comentarios** ("Contanos qué mejorar" en Cuenta, `ComentarioModal`):
  tabla `comentarios`, cada uno inserta a su nombre, solo admins leen
  (`admin_listar_comentarios`).
- **Borrar mi cuenta** (`auth.eliminarMiCuenta`, Cuenta → abajo de todo, dos
  confirmaciones): `eliminar_mi_cuenta` sale de cada hogar como
  `salir_de_hogar`, borra los hogares que quedan vacíos (primero sus
  productos, por el trigger de actividad) y el usuario de Auth. Términos
  versión `2026-10-13`.

**Qué puede un admin en la base vs. en la app.** Algunas policies de las
primeras migraciones (productos, hogares, miembros) incluyen
`or es_administrador()`: en la base, un admin *podría* leer o modificar
datos de hogares ajenos. La app **nunca lo usa**: todas las consultas de
hogares y productos filtran explícitamente por los hogares de los que uno es
miembro (`listarMisHogares`, `listarProductos(hogarId)`, ver
[incidentes-sprint2.md](incidentes-sprint2.md) #2), y las acciones de
miembros pasan por funciones que exigen ser dueño (`expulsar_miembro`,
`ceder_dueno`...). Por eso un admin, desde la app, solo ve sus propios
hogares. Queda pendiente decidir si se recortan esas policies (más seguro)
o se declaran en los Términos.

### `usuarios.ts` — ABM de usuarios para administradores (RF9 parcial)

`listarUsuarios`, `cambiarHabilitado` y `cambiarRol` van todas por RPC
(`admin_listar_usuarios`, `admin_set_usuario_habilitado`,
`admin_set_rol_usuario`, ver
[20261011120000_abm_usuarios_y_habilitado.sql](../supabase/migrations/20261011120000_abm_usuarios_y_habilitado.sql)):
nadie tiene UPDATE sobre `usuarios.rol`/`habilitado` a nivel tabla (antes
cualquiera podía hacerse admin, ver
[incidentes-sprint9.md](incidentes-sprint9.md) #1). Las RPCs exigen
`es_administrador()` y no dejan que un admin se deshabilite ni se quite el
rol a sí mismo. No hay "alta" (las cuentas se crean al loguearse con
Google) y la baja es lógica (`habilitado = false`, reversible).

**Cuenta deshabilitada = bloqueada en la base, no solo en la UI:** los
helpers `es_administrador`/`es_miembro_de`/`es_dueno_de`/`hogar_id_actual`
exigen `usuario_habilitado()`, y un trigger `bloquear_deshabilitado` frena
cualquier escritura en `hogares`, `hogar_miembros`, `productos` y
`productos_catalogo` (incluso desde RPCs `SECURITY DEFINER`). La app solo
acompaña: `RootNavigator` muestra `CuentaDeshabilitadaScreen` si
`usuario.habilitado === false`, y `AuthContext` escucha por Realtime los
UPDATE de la fila propia para que eso pase al instante.
`filtrarUsuarios` (búsqueda + Todos/Administradores/Deshabilitados) es lógica
pura testeada aparte.

### Notificaciones: campanita, push y avisos de vencimiento (Sprint 10)

**Las notificaciones las crea la base, nunca la app** (ver
[20261012120000_notificaciones.sql](../supabase/migrations/20261012120000_notificaciones.sql)
y [incidentes-sprint10.md](incidentes-sprint10.md)): triggers en
`hogar_miembros` (solicitudes, invitaciones, aceptaciones, rechazos,
expulsiones, nuevo dueño), `productos` (cruzar el stock mínimo) y
`productos_catalogo` (sugerencias), más un job diario de `pg_cron` para los
vencimientos. Así llegan aunque la acción la haya hecho otra persona desde
otro celular, y ningún flujo del cliente tiene que acordarse de avisar (mismo
criterio que `actividad_hogar`).

- **`services/notificaciones.ts`**: leer, contar no leídas, marcar como
  leídas, borrar, guardar la preferencia general de días de aviso. Lógica
  pura: `aparienciaNotificacion` (ícono + familia de color),
  `destinoNotificacion` (a qué pantalla lleva tocarla), `tiempoRelativo`,
  `textoGlobito` y `calcularAvisosLocales`.
- **Días de aviso:** `usuarios.dias_aviso_vencimiento` (general, se cambia en
  la campanita) y `productos.dias_aviso_vencimiento` (opcional, en el
  formulario del producto; pisa la general). `diasAvisoDe()` en
  `productos.ts` es la regla, y `estadoVencimiento`/`etiquetaVencimiento`/
  `productosProximosAVencer` reciben la preferencia general como
  `diasPorDefecto`; el job del servidor aplica la misma regla.
- **`context/NotificacionesContext.tsx`**: contador de no leídas, Realtime
  sobre `notificaciones` (cada nueva muestra un cartelito y avisa a quien se
  suscribió con `suscribirseANuevas`, por ejemplo el Home para recargar sus
  alertas), registrar el celular para push al loguearse y desregistrarlo
  antes del `signOut` (`registrarTareaAntesDeCerrarSesion` en
  `services/auth.ts`).
- **`lib/notificacionesPush.ts`** (expo-notifications): push remoto con un
  token de Expo guardado en `push_tokens` (la base lo manda con `pg_net` a la
  Expo Push API en cada notificación nueva); necesita development build y
  Firebase. Si no hay token, **plan B**: programa en el celular los avisos de
  vencimiento. Con la app abierta no muestra el banner del sistema (ya está
  el cartelito). En web no hace nada.
- **`NotificacionesScreen`** (la campanita de la barra de abajo, con el
  numerito de no leídas): lista nuevas primero, preferencias arriba.
  `navigation/navegacion.ts` es una referencia global a la navegación para
  abrirla al tocar una notificación del sistema.

---

### `cuentas.ts` — varias cuentas en el mismo celular (Sprint 10)

Como en Instagram: se puede iniciar sesión con más de una cuenta de Google y
cambiar entre ellas desde Cuenta sin volver al login. Supabase maneja una
sola sesión activa; de las demás se guardan en AsyncStorage los tokens de
acceso y de renovación (mismo lugar y nivel de seguridad que usa Supabase
para la sesión activa). `AuthContext` llama a `recordarSesion` en cada
cambio o renovación de la sesión, así los tokens guardados de cada cuenta
están al día; `cambiarACuenta` los activa con `supabase.auth.setSession`
(si la sesión venció, olvida esa cuenta y avisa). El login pide a Google
`prompt: 'select_account'` para poder elegir otra cuenta.

`signOut()` (en `auth.ts`) ahora cierra la sesión **solo en este celular**
(`scope: 'local'`; antes era global y cerraba la sesión de esa persona en
todos sus dispositivos), olvida la cuenta y, si quedan otras guardadas, pasa
a la usada más recientemente. `cerrarTodasLasSesiones()` olvida todas.
Las notificaciones push van a la cuenta activa: al cambiar de cuenta, el
celular se vuelve a registrar a nombre de la nueva (`registrar_push_token`
mueve el token).

## 5ter. `src/ayuda/` — la ayuda (botón "?")

Mismo criterio que `src/legal/`: el texto de la ayuda vive como datos en
`src/ayuda/contenido.ts` (temas con pasos que nombran los botones tal como
se ven en la app) y `screens/AyudaScreen.tsx` solo lo muestra, con un
buscador (`buscarEnAyuda`). Se abre desde el "?" del encabezado del Home
(`Header` recibe `onAyuda`) y desde Cuenta → Ajustes. **Si se renombra un
botón, actualizar también el texto de la ayuda.**

## 5quater. `src/tutorial/` — tutorial guiado del inicio

La primera vez que una cuenta llega al inicio (o sea, **después del login y
de aceptar los Términos**; nunca en la bienvenida ni en el onboarding),
`BienvenidaTutorialModal` pregunta "¿Es tu primera vez?": "Sí, mostrame" o
"Ya sé usarla". La respuesta se guarda en el dispositivo por cuenta
(`services/tutorial.ts`) y no se vuelve a preguntar; el tutorial se repite
desde Cuenta → "Ver el tutorial" o desde la Ayuda (navegan a `Home` con
`verTutorial: true`).

- **`tutorial.ts`** (puro, con tests): `pasosTutorial` (bienvenida, hogar
  o "crear hogar", agregar producto, ticket/OCR, voz, por vencer, stock
  bajo, campanita, ayuda, final; siempre la misma cantidad para que crear
  el hogar a mitad de camino no corra el número de paso),
  `tutorialReducer` (avanzar, volver, saltar y **pausar**: los pasos con
  botón de acción — "Crear mi primer producto", "Probar con un ticket",
  "Probar por voz", "Crear mi hogar" — esconden el tutorial mientras la
  persona lo hace y siguen con el paso siguiente cuando vuelve al inicio sin
  nada abierto; `esperandoSalida` evita que vuelva en el mismo instante,
  antes de que la navegación ocurra), `ubicarGlobo` (cartel debajo o arriba
  del elemento, flecha alineada) y `scrollParaVer`.
- **`useTutorialInicio.ts`**: el hook que usa `HomeScreen`. Cada elemento a
  señalar se marca con `ref={tutorial.objetivo('agregarProducto')}` (y
  `collapsable={false}`, sin eso Android puede no medirlo); el hook lo mide
  con `measureInWindow`, scrollea el inicio si hace falta y arma las props de
  `TutorialGuiado`. `Header` (`refAyuda`) y `BottomNavBar` (`refsDeTabs`)
  aceptan refs para el "?" y la campanita.
- **`components/TutorialGuiado.tsx`**: Modal transparente que oscurece todo
  menos el elemento (cuatro rectángulos alrededor), un aro que late, la
  flecha y el cartel con progreso ("3 de 10"), puntitos, Atrás / Siguiente
  / Saltar y el botón de acción. Mientras está abierto la pantalla de abajo
  no recibe toques.

**Si se agrega una función importante al inicio**, sumarle un paso en
`pasosTutorial` y marcar su elemento con `tutorial.objetivo(...)`.

## 5bis. `src/legal/` — Términos y Condiciones y créditos

Todo el texto legal vive como datos en `src/legal/terminos.ts` (versión
vigente, secciones, servicios y software usados) y los créditos de las fotos
en `src/legal/creditos.ts`, que importa `assets/catalogo/creditos.json` (la
misma fuente que genera `CREDITOS.md`, así una foto nueva aparece sola).
`screens/TerminosScreen.tsx` solo lo muestra, en tres modos: antes del login
(después del onboarding), "aceptar" (logueado sin la versión vigente:
`RootNavigator` no deja entrar hasta aceptar) y solo lectura (enlace en Home).
`services/terminos.ts` registra la aceptación en la base
(`usuarios.terminos_version`/`terminos_aceptados_at`, RPC `aceptar_terminos`);
lo aceptado antes del login se guarda en AsyncStorage y se registra al
iniciar sesión. Cambiar algo de fondo = subir `VERSION_TERMINOS` (se vuelve a
pedir a todos). Ver [incidentes-sprint10.md](incidentes-sprint10.md).

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
`fetchUsuario()` para traer el perfil actualizado. Además se suscribe por
Realtime a los UPDATE de su propia fila de `usuarios`: si un admin la
deshabilita o le cambia el rol con la app abierta, `usuario` se actualiza
solo (ver `usuarios.ts` más arriba).

**Nota de un bug ya corregido** (ver incidentes, punto 8): antes,
`fetchUsuario` tragaba el error en silencio (`setUsuario(null)` sin más).
Ahora hace `console.warn` con el motivo real — si algo falla acá, va a
aparecer en la consola/logs, no va a quedar invisible.

---

## 7. `src/navigation/RootNavigator.tsx` — qué pantallas se ven

Decide entre dos stacks completos según haya sesión o no:

- **Sin sesión** (`AuthStack`): Welcome → Onboarding → Login.
- **Con sesión** (`AppStack`): Home → Productos. `Productos` recibe
  `{ hogarId, hogarNombre }` como parámetro de navegación (no por
  contexto global): un usuario puede tener más de un hogar (RF6), y cada
  uno tiene su propio inventario, así que la pantalla necesita saber
  explícitamente de cuál hogar mostrar los productos.

Importante: **no mira el rol** todavía para decidir nada (cualquier
usuario logueado entra al mismo stack, sea `usuario` o
`administrador`) — eso es explícitamente para RF9 (sprint 9), no está
resuelto ni hace falta que lo esté ahora. `AdminSugerencias` es la
excepción puntual (ver sección 9): está registrada en el mismo
`AppStack` para cualquier usuario logueado, pero `HomeScreen` no le
ofrece el botón para llegar ahí a quien no sea admin, y la RLS del lado
del servidor es la que de verdad importa si alguien fuerza la
navegación (ver [incidentes-sprint4.md](incidentes-sprint4.md) #2).

---

## 8. `src/components/` — piezas reutilizables

- **`ScreenContainer.tsx`**: envoltorio estándar de pantalla (safe area +
  fondo del theme + padding). Todas las pantallas lo usan para no
  repetir ese boilerplate.
- **`Button.tsx`**: un solo componente para los 3 estilos de botón que
  usa la app (`primary` y `secondary` con degradé, `outline` para
  acciones secundarias). Maneja loading (spinner) y disabled solo.
- **`Logo.tsx`**: el logo real. `assets/logo-casa.png` es la casa recortada
  de `assets/logo-stocky-completo.png` (el archivo original), y "Stocky" +
  el lema van como texto: en el original las letras son negras y en modo
  oscuro no se verían. `compact` muestra solo la casa (encabezado del inicio)
  y `NombreDeHogar` pone el logo chico delante del nombre de un hogar (antes
  era el emoji 🏠). Original de 2000×2000 px; en él, el blanco de la
  botella de leche y el tilde del check venían transparentes (se los había
  llevado el recorte del fondo): al recortar la casa se rellenó de blanco
  todo lo transparente que queda encerrado dentro del dibujo (la sombra de
  abajo sigue semitransparente a propósito). Si llega un logo nuevo, revisar
  eso poniéndolo sobre un fondo de color fuerte.
- **`ProductoFormModal.tsx`**: un solo modal para "Agregar producto" y
  "Editar producto" (mismo patrón que `HogarFormModal`): el modo se
  infiere de si viene un `producto` seteado o no. Nombre/categoría/unidad
  ya NO se tipean (ver catálogo, abajo): en modo "crear" se eligen tocando
  el botón "Elegí un producto" (abre `CatalogoSelectorModal`); en modo
  "editar" quedan de solo lectura, mostrando lo que ya tenía el producto
  -- lo único editable ahí es cantidad y stock mínimo. Ambos se editan
  como texto libre y se parsean recién al submitear (acepta coma o punto
  como separador decimal), para no romper la UI si el usuario borra el
  campo a mitad de tipeo.
- **`EscanearTicketModal.tsx`** (revisión del ticket): cada producto
  detectado se puede corregir si se leyó mal: "Cambiar producto" (elegir
  otro del catálogo con `CatalogoSelectorModal`) o "Escribir a mano" (se
  suelta del catálogo y el nombre queda editable), además de cantidad, marca
  y una fecha de vencimiento opcional. `errorDeCandidato` (en
  `services/escaneo.ts`, igual que `elegirDelCatalogo`/`pasarASinCatalogo`)
  avisa debajo de cada producto qué le falta y bloquea el botón de
  confirmar.
- **`CatalogoSelectorModal.tsx`**: selector del catálogo global de
  productos (ver `services/catalogo.ts`) -- búsqueda + chips de categoría
  sobre la lista ya cargada (mismo criterio 100% client-side que
  `ProductosScreen`), grilla de productos con foto/ícono. Si la búsqueda
  no encuentra nada (o el usuario quiere igual), un botón abre un
  formulario chico embebido para sugerir el producto (nombre + categoría +
  unidad), que llama a `sugerirProducto()` y vuelve a la lista -- no hace
  falta un modal aparte, evita otro viaje de navegación/estado.

## 9. `src/screens/` — pantallas de este sprint

- **`WelcomeScreen`**: logo + slogan + botón "Empezar".
- **`OnboardingScreen`**: 3 pasos estáticos (hogar, productos,
  vencimientos) con un dot indicator, sin librería externa de carrusel.
- **`LoginScreen`**: dispara `signInWithGoogle()` y muestra un
  `Alert` si falla.
- **`HomeScreen`**: dashboard post-login. Muestra loading /
  error-con-reintentar / datos reales según el estado de `usuario` en
  `AuthContext` (ver la nota del punto 6 y el incidente 8) — a
  propósito **no** asume un rol por default. Todo el dashboard gira
  alrededor de un `hogarSeleccionado` (estado local, elegido con el botón
  "Cambiar hogar" dentro de "Tus hogares activos", que solo se muestra si
  hay más de uno entre qué elegir) -- distinto de `usuarios.hogar_id` (el
  "hogar activo" real que usa el resto de la app/RLS), que no se toca desde
  acá. "Tus hogares activos" ahora muestra solo ESE hogar (no la lista
  completa); sus accesos rápidos "Agregar producto"/"Ver despensa" navegan
  directo a `Productos` de ese mismo hogar ("Agregar producto" además le
  pide a `ProductosScreen` que abra el modal de carga apenas llega, vía
  `abrirAgregar: true`). "Actividad reciente" trae datos reales de
  `listarActividadReciente` (`src/services/actividad.ts`), generados por un
  trigger sobre `productos` (ver
  [20260907130000_actividad_hogar.sql](../supabase/migrations/20260907130000_actividad_hogar.sql))
  -- hoy es lo único con ABM real, así que es lo único que se registra.
- **`ProductosScreen`** (RF7): listado + ABM de productos de un hogar
  puntual. Búsqueda por nombre y filtro por categoría son 100%
  client-side sobre la lista ya cargada (`listarProductos`) -- a la
  escala esperada (docs/plan-de-testing.md habla de ~20-30 productos por
  hogar) no vale la pena ir a la base por cada letra tipeada. Las
  categorías del filtro se calculan de los productos ya cargados (no es
  una lista fija), así que un chip solo aparece si hay al menos un
  producto con esa categoría.
- **`AdminSugerenciasScreen`**: sugerencias de productos nuevos para el
  catálogo global (ver `services/catalogo.ts`), pendientes de aprobar o
  rechazar. Primera pantalla de la app con acceso restringido por rol
  (ver la nota de `RootNavigator` en la sección 7 y
  [incidentes-sprint4.md](incidentes-sprint4.md) #2).
- **`AdminUsuariosScreen`**: ABM de usuarios para admins (búsqueda, filtro,
  switch de habilitado y botón de rol; sin acciones sobre la cuenta propia).
  Mismo gateo que `AdminSugerenciasScreen`: el acceso solo aparece en
  HomeScreen para admins, y la barrera real son las RPCs `admin_*`.
- **`NotificacionesScreen`**: la campanita (ver "Notificaciones" en la
  sección 5). Tocar una notificación la marca como leída y lleva a la
  despensa con el filtro que corresponda, a "Miembros del hogar" (Home recibe
  `abrirMiembrosDe`), al inicio o a sugerencias.
- **`CuentaScreen`** (botón de la persona en la barra de abajo): perfil
  (nombre editable con `actualizarMiNombre`), varias cuentas (cambiar,
  agregar), apariencia (sistema/claro/oscuro), accesos a Notificaciones y a
  los Términos, versión de la app, y cerrar sesión (de esta cuenta o de
  todas). "Cerrar sesión" y el enlace a los Términos salieron del Home.
- **`CuentaDeshabilitadaScreen`**: lo único que ve una cuenta deshabilitada
  (mensaje + cerrar sesión). La muestra `RootNavigator` en lugar del stack
  principal.

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

## 12. `supabase/functions/` — Edge Functions

`ocr-ticket`, `vencimiento-foto` y `voz-a-texto` son los "receptores" de
lo que va a llamar `services/externalApis.ts`. Corren en Deno (no en
Node), por eso tienen su propio `deno.json` y están **excluidos** del
`tsconfig.json` de la raíz (si no, TypeScript se queja de que no
conoce el global `Deno`). `ocr-ticket` usa OCR.space; `vencimiento-foto`
y `voz-a-texto` usan Gemini a través de `_shared/gemini.ts` (misma key
`GEMINI_API_KEY`, modelos de respaldo configurables con el secret
`GEMINI_MODEL`). `_shared/cors.ts` son los headers CORS que comparten
las tres.

`_shared/gemini.ts` prueba los modelos en orden (`3.5-flash` →
`3.5-flash-lite` → `3.8-flash`): si uno no contesta en 5 s consulta en
paralelo al siguiente y gana el primero que responda (los demás se
cancelan); un 503/429/404/500 pasa al siguiente enseguida y cualquier otro
error corta. Loguea qué modelo respondió y en cuánto, para revisar el orden
con datos (ver [incidentes-sprint8.md](incidentes-sprint8.md) #1). Lee
`Deno.env` vía `globalThis` para poder testearlo con Jest
(`src/services/geminiRespaldo.test.ts`), igual que `_shared/ticket.ts`.

`voz-a-texto` tiene dos modos: `comando` (recibe el audio, la fecha de hoy
del celular y el inventario del hogar; devuelve transcripción + acciones)
y `fecha` (solo una fecha dictada). Nunca guarda nada.

**Antes de desplegar:** `npx deno check <función>/index.ts` (el despliegue
no valida tipos) y, desde la MCP de Supabase, pasar
`import_map_path: "deno.json"` al redesplegar una función existente (ver
[incidentes-sprint8.md](incidentes-sprint8.md), errores de proceso #1).

---

## 13. Config del proyecto: `app.json`, `eas.json`, `tsconfig.json`, `babel.config.js`

- **`app.json`**: config de Expo. Lo más importante para el equipo:
  `"scheme": "stocky"` (el deep link `stocky://auth/callback` que usa el
  login de Google en el development build de expo.dev — ver incidente 2), y
  `extra.eas.projectId` +
  `android.package` (identidad del proyecto/app para EAS Build, no se
  deberían cambiar una vez que existan builds subidas).
  Íconos: `icon` (ícono general), `android.adaptiveIcon` (casa sobre fondo
  blanco; el foreground deja margen porque Android recorta el ícono en
  círculo o gota) y `web.favicon`. `web.name` ("STOCKY") es el título de la
  pestaña en la web, y `RootNavigator` lo mantiene con
  `documentTitle` (si no, React Navigation pone el nombre de cada pantalla).
  **Cambiar un ícono es un cambio nativo:** en la APK se ve recién con una
  build nueva (`eas build`); en la web alcanza con publicar.
- **`eas.json`**: perfiles de build de EAS (`development`, `preview`,
  `production`). **El equipo prueba la app con el perfil `development`**:
  el development build de [expo.dev](https://expo.dev) (EAS), instalado en
  el celular y conectado con `npx expo start --dev-client`. Nació como
  solución definitiva al bug de IP de Expo Go (ver incidente 9 del Sprint
  1) y hoy es obligatorio: Expo Go en Android no soporta las notificaciones
  push (SDK 53+) ni los módulos nativos que se fueron sumando. **Cada vez
  que se agrega una librería con código nativo** (`expo-audio` y
  `expo-file-system` en el Sprint 8, `expo-notifications` y `expo-device`
  en el Sprint 10) hay que generar un build nuevo con `eas build --profile
  development --platform android` e instalarlo; los cambios de JS/TS
  llegan solos por hot reload. `CalendarioPicker` se armó a propósito sin
  librerías nativas.
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

Los módulos compartidos de las Edge Functions que no dependen de Deno
(`_shared/ticket.ts`, `_shared/gemini.ts`) también se testean con Jest,
importándolos desde `src/services/*.test.ts`. Jest ignora `.claude/`
(`testPathIgnorePatterns` en `package.json`): ahí Claude Code guarda copias
del repo cuyos tests no deben correr.

---

## Cómo mantener esto al día

Cuando se agregue una pieza nueva importante (una pantalla, un
servicio, una tabla), sumale una sección corta acá explicando **para
qué sirve y por qué se decidió así** — no hace falta repetir el código,
alcanza con el motivo que no se ve a simple vista leyendo los archivos.
