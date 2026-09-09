# Incidentes y soluciones — Sprint 4

Registro de los problemas no triviales encontrados durante este sprint
(vencimiento de productos, calendario de fecha, invitar por mail + ceder
dueño/cancelar solicitud). Mismo espíritu que
[docs/incidentes-sprint1.md](incidentes-sprint1.md),
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
