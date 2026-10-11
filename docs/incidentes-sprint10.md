# Incidentes y notas — Sprint 10 (notificaciones)

Registro de los problemas y decisiones de las **notificaciones** (campanita,
push al teléfono, avisos de vencimiento configurables y cartelitos propios en
vez de los diálogos del sistema), rama `feature/notificaciones`, apilada sobre
el PR #15. Mismo espíritu que
[incidentes-sprint1.md](incidentes-sprint1.md) a
[incidentes-sprint9.md](incidentes-sprint9.md).

Migración nueva:
[20261012120000_notificaciones.sql](../supabase/migrations/20261012120000_notificaciones.sql).

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
El equipo ya usa development build (EAS), así que se puede, pero hay dos
pasos que no puede hacer Claude:

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
   `notificacionesPush.test.ts`).
3. **`to_char` con decimales** dejaba "3." en enteros en el mensaje de stock;
   se cambió por `trim_scale()` antes de aplicar la migración.
