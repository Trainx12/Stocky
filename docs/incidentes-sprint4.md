# Incidentes y soluciones — Sprint 4

Registro de los problemas encontrados durante la revisión de QA del
[PR #4](https://github.com/Trainx12/Stocky/pull/4) — "ABM de hogar: editar,
salir, jerarquia dueno/invitado" (Nico), antes de mergear a `main`. Mismo
espíritu que [docs/incidentes-sprint1.md](incidentes-sprint1.md),
[docs/incidentes-sprint2.md](incidentes-sprint2.md) y
[docs/incidentes-sprint3.md](incidentes-sprint3.md): que si un error
parecido vuelve a aparecer, no haya que redescubrirlo de cero.

---

## 1. Error genérico al renombrar un hogar del que ya no sos miembro (y ausencia de un límite dueño/invitado)

**Síntoma:** probando con dos cuentas reales (celular y computadora) a la
vez: se expulsó a un invitado desde la cuenta dueña, y casi al mismo
tiempo, desde la otra cuenta, se intentó cambiar el nombre del hogar. El
intento de renombrar mostró el mensaje genérico "Un error inesperado ha
ocurrido" en vez de explicar qué había pasado. En un primer análisis se
sospechó que el invitado ya expulsado había logrado renombrar el hogar
igual (bypass de permisos) — **eso se descartó** al cruzar los
`edge_logs` reales del proyecto en Supabase con más cuidado (ver abajo).

**Causa raíz (corroborada contra los `edge_logs` reales, cruzando qué
cliente/rol emitió cada request, no solo la marca de tiempo):**

1. El `PATCH` de renombre que devolvió `200` (12:31:22) y el
   `POST rpc/expulsar_miembro` que devolvió `204` (12:31:45) salieron del
   mismo cliente (`okhttp`, la app nativa). `expulsar_miembro` únicamente
   puede ejecutarse con éxito si quien la invoca es el **dueño** (lo
   valida `es_dueno_de()` del lado del servidor) — como devolvió `204`,
   esa sesión **era** la del dueño. Es decir, el renombre exitoso de
   12:31:22 lo hizo el dueño sobre su propio hogar (acción normal,
   siempre permitida), no el invitado. No hubo ningún bypass: no hay
   evidencia en los logs de que el invitado haya llegado a renombrar el
   hogar, ni antes ni después de ser expulsado.
2. El intento que sí fue del invitado (desde el navegador, `Mozilla/...`)
   llegó a las 12:31:59 — **catorce segundos después** de que la
   expulsión ya estaba aplicada (12:31:45) — y la RLS lo rechazó
   correctamente: `PATCH .../hogares?id=eq...  → 406` (0 filas
   afectadas). El comportamiento de permisos fue correcto en los dos
   casos. El bug real es solo de UX: cuando la RLS bloquea el `UPDATE`,
   `editarHogar()` (`src/services/hogares.ts`) encadena
   `.select().single()` sobre el resultado, y con 0 filas PostgREST
   devuelve el error genérico `PGRST116` (`JSON object requested,
   multiple (or no) rows returned`) → HTTP 406. La pantalla no distingue
   este caso de cualquier otro error y muestra el mensaje genérico "Un
   error inesperado ha ocurrido", en vez de algo como "Ya no sos miembro
   de este hogar".
3. Aparte del bug de UX, la prueba dejó a la vista un límite real (no un
   bug) de la policy `hogares_update_propio_o_miembro_o_admin` (ver
   `supabase/migrations/20260826130000_hogares_multi_membresia.sql`):
   permite renombrar a **cualquier miembro** del hogar (dueño o invitado
   por igual), sin que el dueño pueda restringirlo. No es lo que causó
   este incidente puntual, pero quedó pendiente como mejora de producto.

**Solución pendiente:**

1. Que `editarHogar()` (o la pantalla que la llama) distinga el error de
   permiso/RLS (`406` / `PGRST116`, 0 filas afectadas) del resto de
   errores inesperados, y muestre un mensaje claro en ese caso puntual
   (ej. "Ya no sos miembro de este hogar").
2. Agregar un toggle a nivel hogar (visible y editable solo por el
   dueño) para habilitar o deshabilitar si los invitados pueden cambiar
   el nombre del hogar. Hoy cualquier miembro puede renombrar sin que el
   dueño tenga forma de restringirlo.

---

**Para quien lea esto desde `CLAUDE.md`/`AGENTS.md`: todavía falta
implementar la solución de este incidente (los dos puntos de arriba). Si
estás por arrancar una funcionalidad nueva y ves este mensaje, resolvé
esto como parte de tu trabajo, o como paso previo si toca la pantalla de
edición/miembros de hogar.**

**Cuando se resuelva: borrar el párrafo anterior (el que dice "todavía
falta implementar") y actualizar esta entrada para reflejar la solución
realmente aplicada — no dejar los dos mensajes conviviendo.**
