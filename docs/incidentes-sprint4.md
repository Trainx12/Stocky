# Incidentes y soluciones — Sprint 4

Registro de los problemas no triviales encontrados durante este sprint
(vencimiento de productos, calendario de fecha, invitar por mail + ceder
dueño/cancelar solicitud, y el catálogo global de productos). Mismo
espíritu que [docs/incidentes-sprint1.md](incidentes-sprint1.md),
[docs/incidentes-sprint2.md](incidentes-sprint2.md) y
[docs/incidentes-sprint3.md](incidentes-sprint3.md): que si un error
parecido vuelve a aparecer, no haya que redescubrirlo de cero.

---

## 1. `20260908120000_invitar_por_email.sql` nunca se había aplicado contra el proyecto real

**Síntoma:** reportado por el equipo probando la app: "se rompió el botón
para cancelar una invitación, no me deja cancelar las invitaciones a
otros hogares" (en realidad se refería a cancelar una **solicitud** que
mandó a otro hogar, no a una invitación recibida — ver incidente 2).

**Investigación:** antes de tocar código, se auditó el estado real de la
base contra lo que documenta el repo (`list_migrations` vs. los archivos
en `supabase/migrations/`). La migración
[20260908120000_invitar_por_email.sql](../supabase/migrations/20260908120000_invitar_por_email.sql)
(la columna `origen`, y las RPCs `invitar_a_hogar` / `responder_invitacion`
/ `listar_mis_invitaciones_pendientes`) **no figuraba en absoluto** en
`list_migrations` del proyecto real, a pesar de estar en el repo (mergeada
a `feature/invitar-por-email`) hace varios commits. Mismo patrón exacto
que [incidentes-sprint3.md](incidentes-sprint3.md) #4: una migración en
la rama no tiene efecto hasta que se aplica contra el proyecto de
Supabase que se usa para probar.

**Impacto real:** mientras esta migración no estuvo aplicada, la columna
`origen` no existía en `hogar_miembros` -- así que `payload.old.origen`
en cualquier evento de Realtime le llegaba `undefined` al cliente, sin
importar qué diga el código de `HomeScreen.tsx` (ver incidente 2, que
depende de esto). Además, toda la funcionalidad de "invitar por mail"
(RPCs `invitar_a_hogar`, `responder_invitacion`,
`listar_mis_invitaciones_pendientes`) directamente no existía en el
backend real -- cualquier llamada a esas RPCs desde la app fallaba.

**Solución:** aplicar la migración pendiente contra el proyecto real
(`apply_migration` de la MCP de Supabase). Confirmado después por SQL
que la columna `origen` y las tres RPCs ya existen.

**Cómo evitar que vuelva a pasar:** antes de dar por "lista para probar"
cualquier funcionalidad que dependa de un cambio de esquema o de una RPC
nueva, correr `list_migrations` (o probar la RPC/columna afectada por SQL
directo) contra el proyecto real, no confiar en que "ya está mergeada a
la rama" -- eso no implica que se haya aplicado.

---

## 2. Cancelar una solicitud propia mostraba "Te sacaron de un hogar"

**Síntoma:** al cancelar una solicitud que uno mismo mandó para unirse a
otro hogar (`handleCancelarSolicitud` en `HomeScreen.tsx`), la solicitud
sí se cancelaba (la fila se borraba de verdad), pero además aparecía un
aviso incorrecto: "Te sacaron de un hogar. Ya no formás parte de ese
hogar." -- como si a uno lo hubieran expulsado de un hogar del que ya era
miembro, en vez de simplemente haber cancelado un pedido propio que
todavía no había sido aceptado.

**Causa raíz (dos capas):**

1. **Capa de datos** (ver incidente 1): el handler de Realtime `DELETE`
   de `hogar_miembros` en `HomeScreen.tsx` usa `payload.old.estado` para
   decidir qué aviso mostrar (`'Solicitud rechazada'` si `estado ===
   'pendiente'`, `'Te sacaron de un hogar'` en cualquier otro caso). Con
   la migración de "invitar por mail" sin aplicar, la columna `origen` no
   existía -- pero además, revisando la publicación de Realtime
   (`pg_publication_tables`), se encontró que la lista de columnas
   publicadas para `hogar_miembros` estaba **congelada** desde antes de
   que existiera `origen` (la migración que habilitó Realtime usó `alter
   publication ... add table public.hogar_miembros;` sin lista de
   columnas, pero Supabase igual la dejó con una lista fija: `{hogar_id,
   usuario_id, created_at, rol, puede_editar, estado}`). Se corrigió con
   una migración nueva
   ([20260909200553_fix_realtime_columnas_hogar_miembros.sql](../supabase/migrations/20260909200553_fix_realtime_columnas_hogar_miembros.sql))
   que vuelve a listar todas las columnas actuales, incluida `origen`.

2. **Capa de lógica** (el bug real, no se arregla solo con la migración):
   incluso con `origen` llegando bien, **cancelar mi propia solicitud** y
   **que el dueño la rechace** son, para Realtime, el mismo evento exacto
   -- un `DELETE` sobre una fila con `estado='pendiente'` y
   `origen='solicitud'`. No hay ningún campo en la fila que diga "quién"
   disparó el borrado, así que el cliente no puede distinguir los dos
   casos solo mirando `payload.old`. El código ya tenía este mismo
   problema resuelto para "rechacé mi propia invitación" (ahí sí se puede
   distinguir por `origen='invitacion'`), pero cancelar una solicitud
   propia no tenía ningún mecanismo de supresión.

**Solución:** `HomeScreen.tsx` ahora guarda en un `useRef<Set<string>>`
(`solicitudesCanceladasPorMi`) el `hogar_id` de cada solicitud que el
propio usuario cancela, ANTES de llamar a `cancelarSolicitud()`. El
handler de `DELETE` de Realtime chequea primero ese set (`Set#delete`
devuelve `true` si estaba y lo saca) y, si el `hogar_id` está marcado, no
muestra ningún aviso -- ya se reflejó en la UI al tocar el botón.

**Cómo evitar que vuelva a pasar:** cuando una acción del propio usuario
puede generar un evento de Realtime indistinguible de una acción de otra
persona (mismo tipo de fila, mismo cambio de estado), no alcanza con
mirar el contenido del payload -- hace falta que el cliente marque de
antemano "esto lo hice yo" antes de disparar la acción.

---

## 3. `hogares.test.ts` seguía con el mock desactualizado de `listarMisHogares` en varias ramas partidas de `main`

**Síntoma:** al arrancar una rama nueva desde `main` recién actualizado y
correr `npm test` como paso de rutina antes de programar, 4 tests de
`describe('listarMisHogares', ...)` fallaban (mock de `.eq()` sin
`.in()`, aserciones sin el campo `solicitudesPendientes`).

**Causa raíz:** el commit que agregó el conteo de solicitudes pendientes
a `listarMisHogares()` nunca actualizó sus propios tests. Como varias
ramas de este sprint (`feature/limite-nombre-hogar`,
`feature/invitar-por-email`, `feature/catalogo-productos`) partieron
todas de `main` antes de que ese fix llegara a mergearse ahí, cada una lo
encontró (y arregló) por separado.

**Solución:** mismo fix en las tres -- `mockEq` ahora resuelve tanto
`.order()` como `.in()`, y los 4 tests afectados esperan
`solicitudesPendientes: 0` en el resultado.

**Cómo evitar que vuelva a pasar:** cuando este fix llegue a `main` (por
la primera de estas ramas que se mergee), las otras van a traer el mismo
cambio duplicado -- no hay nada raro en eso, git lo resuelve solo al
mergear (mismo contenido final). Lo que sí conviene: si alguien ve este
mismo fallo de nuevo en una rama nueva, es señal de que conviene mergear
a `main` la rama que ya lo tiene resuelto en vez de seguir parcheándolo
por rama.

---

## 4. `REPLICA IDENTITY FULL` + lista de columnas en la publicación de Realtime rompía todo `UPDATE` de `hogar_miembros`

**Síntoma:** reportado por QA -- al intentar aceptar la solicitud de un
invitado desde "Miembros del hogar", aparecía "Error: No se pudo
responder la solicitud." El mismo problema afectaba a cualquier otra
acción que hiciera un `UPDATE` sobre `hogar_miembros`: aceptar/rechazar
invitación (`responder_invitacion`), ceder dueño (`ceder_dueno`),
habilitar "puede editar" (`permitir_editar_hogar`).

**Causa raíz:** el incidente 2 de este mismo documento dejó
`hogar_miembros` con `REPLICA IDENTITY FULL` (para que Realtime mande la
fila completa como "old record"). Más tarde,
[20260909200553_fix_realtime_columnas_hogar_miembros.sql](../supabase/migrations/20260909200553_fix_realtime_columnas_hogar_miembros.sql)
le agregó a la publicación `supabase_realtime` una lista explícita de
columnas para esa tabla (buscando que Realtime volviera a mandar
`origen`). Postgres no permite combinar `REPLICA IDENTITY FULL` con una
lista de columnas en la publicación -- ni siquiera si la lista incluye
absolutamente todas las columnas de la tabla. Desde que esa migración se
aplicó, cualquier `UPDATE` sobre `hogar_miembros` empezó a fallar con:

```
ERROR: 42P10: cannot update table "hogar_miembros"
DETAIL: Column list used by the publication does not cover the replica identity.
```

El error nunca llegaba legible a la UI: `responder_solicitud()` lo
relanza como una excepción de Postgres, pero el cliente (`avisar('Error',
err instanceof Error ? err.message : '...')`) mostraba el mensaje
genérico de fallback porque el problema se reprodujo primero contra la
base directamente, no se llegó a inspeccionar qué le llegaba al
`catch` en el cliente -- si vuelve a pasar algo parecido, conviene
loguear `err` completo (no solo `.message`) antes de asumir cuál es el
mensaje real.

**Solución:**
[20260910212500_fix_replica_identity_full_vs_columnas_publicacion.sql](../supabase/migrations/20260910212500_fix_replica_identity_full_vs_columnas_publicacion.sql)
saca la lista de columnas de la publicación
(`alter publication supabase_realtime set table public.hogar_miembros;`
sin lista). Con `REPLICA IDENTITY FULL` no hace falta listar columnas --
ya se manda la fila entera (incluido `origen`) tanto en el registro nuevo
como en el "old record", así que sacar la lista no reintroduce el bug
del incidente 2.

**Cómo evitar que vuelva a pasar:** si una tabla tiene `REPLICA IDENTITY
FULL`, su entrada en `supabase_realtime` (o cualquier publicación) nunca
debe llevar una lista explícita de columnas -- ni para "arreglar" qué
columnas manda Realtime. Ese ajuste solo tiene sentido en tablas con
replica identity por default (primary key). Antes de tocar la
publicación de una tabla, chequear `relreplident` en `pg_class` primero.

---

## 5. Notas de diseño del catálogo de productos (no son bugs, pero conviene dejarlas escritas)

- **Fotos pendientes:** `productos_catalogo.imagen_url` queda `null` en
  toda la semilla cargada con la migración -- el equipo va a pasar
  imágenes reales (de [Open Food Facts](https://world.openfoodfacts.org),
  base de datos abierta de productos con fotos) para completarlas
  después. Mientras tanto, `CatalogoSelectorModal` muestra un ícono
  genérico (🧺) en vez de romper o dejar un hueco en blanco.
- **Enforcement del lado del cliente, no del servidor:** que "solo se
  pueda cargar un producto del catálogo" es una regla de UI
  (`ProductoFormModal` ya no tiene un campo de texto libre para el
  nombre), no un constraint de base -- mismo criterio que el resto de la
  validación de `productos.ts`/`hogares.ts` en este proyecto. Alguien que
  hable directo con la API de Supabase (no con la app) podría insertar
  cualquier `nombre` en `productos`. Si en algún momento hace falta cerrar
  ese hueco de verdad, la forma prolija es un trigger que valide
  `catalogo_id` contra una fila `aprobado`, no repetir la validación de
  texto en más lugares.
- **Primera pantalla gateada por rol:** `AdminSugerenciasScreen` es la
  primera pantalla de la app que un usuario común no debería ver -- el
  gateo real es la RLS (`es_administrador()` en las policies de
  `productos_catalogo`), no la navegación: `RootNavigator` sigue sin
  mirar el rol (eso es RF9, Sprint 9), `HomeScreen` simplemente no le
  muestra el botón a quien no sea admin, y si alguien fuerza la
  navegación de todos modos, la RLS igual no le devuelve ninguna
  sugerencia ajena.
- **Alcance del catálogo:** solo productos ALIMENTICIOS -- se sacaron
  "Limpieza" e "Higiene" (no son comida) y "Congelados" (pedido directo
  del equipo), además de "Carnes" (tampoco contemplada desde el
  principio). Categorías finales: Lácteos, Verduras y frutas, Panadería,
  Bebidas, Snacks, Otros.
