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

## 2. Cualquier miembro podía renombrar el hogar (no solo el dueño)

**Síntoma:** reportado por el equipo probando la app: cualquier invitado
podía cambiarle el nombre a un hogar del que no era dueño, y ese cambio se
guardaba sin problema. También se reportó, junto con esto, que "un
usuario puede eliminar al dueño" y que "el dueño elimina un usuario, y el
usuario puede editar el nombre aunque ya esté eliminado".

**Investigación de la segunda parte del reporte:** antes de tocar código,
se auditó el estado real de la base (`pg_get_functiondef` de
`expulsar_miembro`/`es_dueno_de`, y `pg_policies` de `hogar_miembros`) y
coincidía exactamente con lo diseñado en
[20260827140000_hogares_jerarquia.sql](../supabase/migrations/20260827140000_hogares_jerarquia.sql):
la policy de DELETE de `hogar_miembros` solo permite `usuario_id =
auth.uid()` (borrar la propia fila) o admin, y `expulsar_miembro()`
rechaza tanto a quien no es dueño como al intento de expulsar al propio
dueño. **No se encontró forma de reproducir "un invitado elimina al
dueño" contra el backend desplegado.** Es posible que lo que se haya
observado sea al dueño usando "Salir del hogar" (que sí es voluntario y
sin restricción) y no una expulsión hecha por un invitado — pero no se
confirmó, así que si vuelve a aparecer conviene reportar los pasos
exactos para reproducirlo.

**Causa raíz (de la parte sí confirmada, editar el nombre):** la policy
de UPDATE de `hogares` era `es_dueno_de(id) o es_miembro_de(id) o
es_administrador()` — cualquier miembro, sin distinguir jerarquía, podía
pasar el chequeo. Como consecuencia directa, esto también explica el
"usuario expulsado que todavía puede editar": mientras la única condición
era "ser miembro", cualquier invitado (expulsado o no) que lograra pasar
esa condición podía editar; una vez expulsado ya no es miembro y la
policy ya lo bloqueaba, pero el punto más amplio (cualquier invitado
podía editar mientras seguía siendo miembro) sí era real y es lo que se
corrigió.

**Solución:** ver
[20260828120000_permisos_editar_hogar.sql](../supabase/migrations/20260828120000_permisos_editar_hogar.sql).
Nueva columna `hogar_miembros.puede_editar` (default `false`); la policy
de UPDATE de `hogares` pasa a exigir `es_dueno_de(id) OR (es miembro Y
puede_editar = true) OR admin`. Nueva RPC `permitir_editar_hogar()` (solo
el dueño puede llamarla) para habilitar/deshabilitar ese permiso por
invitado puntual, expuesta en la UI como un switch dentro de "Miembros
del hogar".

---

## 3. El usuario expulsado no se enteraba hasta recargar la app a mano

**Síntoma:** al expulsar a alguien, quien expulsa ve el cambio al
instante (su propia pantalla se recarga después de llamar a la RPC), pero
el expulsado seguía viendo el hogar en su lista hasta cerrar y volver a
abrir la app — nada le avisaba en el momento.

**Causa raíz:** no había ningún mecanismo para que el cliente del usuario
expulsado se enterara de un cambio hecho por OTRO cliente (el del dueño).
Sin Realtime, cada pantalla solo se actualiza cuando ELLA MISMA dispara
una acción; no hay forma de que un cambio ajeno le llegue sola.

**Solución:** se habilitó Supabase Realtime en `hogar_miembros` (`alter
publication supabase_realtime add table public.hogar_miembros`) y
`HomeScreen` se suscribe a los `DELETE` de su propia fila
(`filter: usuario_id=eq.<mi id>`): al detectar que lo expulsaron de un
hogar, avisa y refresca `misHogares`/`usuario` sin que el usuario tenga
que hacer nada.

--- JULI

## 4. Migración aplicada en el repo pero no en el proyecto Supabase real: "se perdieron" los hogares

**Síntoma:** después de implementar aceptar/rechazar invitados (columna
`hogar_miembros.estado`), un usuario real (con hogares ya creados desde
antes) abrió la app y "Tus hogares activos" apareció vacío -- como si
hubiera perdido toda su membresía -- aunque las filas seguían existiendo
en la tabla (confirmado por SQL directo contra la base).

**Causa raíz:** la migración
[20260903120000_solicitudes_hogar.sql](../supabase/migrations/20260903120000_solicitudes_hogar.sql)
solo existía como archivo en la rama de trabajo -- todavía no se había
aplicado al proyecto real de Supabase. El código nuevo de
`listarMisHogares()` ya pedía la columna `estado` en el `select(...)`;
como esa columna no existía en la base, PostgREST devolvía **400** en
cada request (confirmado revisando `edge_logs` con `query_logs`: las
llamadas con `estado` en el `select` fallaban con 400, las mismas
llamadas sin ese campo, de antes del cambio, seguían devolviendo 200).
`listarMisHogares()` atrapa cualquier error de la consulta y lo loguea
con `console.warn` sin cortar el render -- por diseño, para que un fallo
de red no rompa toda la pantalla -- pero eso mismo hizo que el error
quedara invisible para quien probaba la app: la UI mostraba "no tenés
hogares" en vez de un mensaje de error real.

**Solución:** aplicar la migración pendiente contra el proyecto real
(`apply_migration` de la MCP de Supabase). Como la columna nueva tiene
default `'aprobado'`, ninguna membresía existente se vio afectada -- se
confirmó por SQL que las filas del usuario que reportó el problema
siguieron en estado `'aprobado'` después de aplicar la migración, y que
la consulta que antes devolvía 400 volvió a devolver 200.

**Cómo evitar que vuelva a pasar:** una migración nueva en
`supabase/migrations/` no tiene efecto real hasta que se aplica contra
el proyecto de Supabase -- tenerla en la rama (o incluso mergeada a
`main`) no alcanza. Antes de dar por "lista para probar" cualquier
funcionalidad que dependa de un cambio de esquema, confirmar que la
migración ya corrió contra el proyecto que se va a usar para probar (acá
ayuda pedirle a Claude que corra `list_migrations` o pruebe la consulta
afectada por SQL directo antes de decir "ya podés probarlo").

---

## Estado actual (para referencia rápida)

- `src/lib/alert.ts` es el único lugar del código que debería importar
  `Alert` de `react-native` para mostrar diálogos al usuario.
- Editar el nombre de un hogar requiere ser dueño, o invitado con
  `puede_editar = true` (habilitado por el dueño desde "Miembros del
  hogar"). Default: solo el dueño puede editar.
- `HomeScreen` está suscripto a Realtime para enterarse al instante si lo
  expulsan de un hogar mientras tiene la app abierta.
- Aceptar/rechazar invitados (`hogar_miembros.estado`, ver
  [20260903120000_solicitudes_hogar.sql](../supabase/migrations/20260903120000_solicitudes_hogar.sql))
  y el ABM de productos (RF7, `src/services/productos.ts` +
  `ProductosScreen`/`ProductoFormModal`) se agregaron durante este sprint
  también -- ver [arquitectura-del-codigo.md](arquitectura-del-codigo.md)
  para el detalle de cómo están armados.
- Verificado por Claude: `tsc --noEmit` limpio, `npm test` sin errores,
  `get_advisors` de seguridad sin hallazgos nuevos, la app sigue
  bundleando y renderizando sin errores en `expo start --web`, y se
  auditó el estado real de la base (funciones/policies) contra lo que
  documenta el código.
- **Pendiente de un humano:** probar con dos cuentas reales el flujo
  completo (dueño habilita edición a un invitado, el invitado edita,
  el dueño lo deshabilita/expulsa, el invitado se entera al instante) —
  esto requiere login real, que Claude no puede hacer por sí solo. Si
  alguien logra reproducir "un invitado elimina al dueño", documentarlo
  acá con los pasos exactos. Ídem para la ruta crítica del ABM de
  productos (crear/editar/eliminar, buscar, filtrar por categoría).
