# Incidentes y soluciones — Sprint 4

Registro de los problemas encontrados durante la revisión de QA del
[PR #4](https://github.com/Trainx12/Stocky/pull/4) — "ABM de hogar: editar,
salir, jerarquia dueno/invitado" (Nico), antes de mergear a `main`. Mismo
espíritu que [docs/incidentes-sprint1.md](incidentes-sprint1.md),
[docs/incidentes-sprint2.md](incidentes-sprint2.md) y
[docs/incidentes-sprint3.md](incidentes-sprint3.md): que si un error
parecido vuelve a aparecer, no haya que redescubrirlo de cero.

---

## 1. Un invitado podía cambiar el nombre del hogar (incluso justo antes de ser expulsado)

**Síntoma:** probando con dos cuentas reales (celular e computadora) a la
vez: se expulsó a un invitado desde la cuenta dueña, y casi al mismo
tiempo el invitado le cambió el nombre al hogar. El cambio de nombre se
guardó igual y se vio reflejado incluso del lado del dueño. Al repetir el
intento de renombrar ya expulsado, la app mostró el mensaje genérico
"Un error inesperado ha ocurrido" en vez de explicar qué había pasado.

**Causa raíz (corroborada contra los `edge_logs` reales del proyecto en
Supabase):**

1. La policy `hogares_update_propio_o_miembro_o_admin` (ver
   `supabase/migrations/20260826130000_hogares_multi_membresia.sql`)
   permite el `UPDATE` de un hogar a **cualquier miembro** (dueño o
   invitado por igual), no solo al dueño. `editarHogar()` (`src/services/hogares.ts`)
   no agrega ninguna restricción extra del lado del cliente ni existe una
   RPC que valide el rol antes de renombrar. Por eso el PATCH de renombre
   que salió del invitado a las 12:31:22 se ejecutó y devolvió `200` —
   en ese instante todavía **era** miembro legítimo, la RLS no falló ni
   se saltó nada. Recién a las 12:31:45 se completó la expulsión
   (`POST rpc/expulsar_miembro`, `204`). No es un bypass de seguridad:
   es que hoy "renombrar" es una acción de cualquier miembro, no
   exclusiva del dueño, y la carrera entre ambas acciones la ganó el
   renombre por haber salido primero.
2. El intento posterior de renombrar ya expulsado (12:31:59) sí fue
   rechazado correctamente por la RLS: `PATCH .../hogares?id=eq...  → 406`
   (0 filas afectadas). Ahí aparece el segundo problema, de UX: cuando la
   RLS bloquea el `UPDATE`, `editarHogar()` encadena `.select().single()`
   sobre el resultado, y con 0 filas PostgREST devuelve el error genérico
   `PGRST116` (`JSON object requested, multiple (or no) rows returned`) →
   HTTP 406. La pantalla no distingue este caso de cualquier otro error y
   muestra el mensaje genérico "Un error inesperado ha ocurrido", en vez
   de algo como "Ya no sos miembro de este hogar" o "No tenés permiso
   para editar este hogar".

**Solución pendiente:**

1. Que `editarHogar()` (o la pantalla que la llama) distinga el error de
   permiso/RLS (`406` / `PGRST116`, 0 filas afectadas) del resto de
   errores inesperados, y muestre un mensaje claro en ese caso puntual.
2. Agregar un toggle a nivel hogar (visible y editable solo por el
   dueño) para habilitar o deshabilitar si los invitados pueden cambiar
   el nombre del hogar. Hoy cualquier miembro puede renombrar sin que el
   dueño tenga forma de restringirlo — eso es lo que permitió que el
   invitado renombrara el hogar mientras todavía era miembro, justo
   antes de la expulsión.

---

**Para quien lea esto desde `CLAUDE.md`/`AGENTS.md`: todavía falta
implementar la solución de este incidente (los dos puntos de arriba). Si
estás por arrancar una funcionalidad nueva y ves este mensaje, resolvé
esto como parte de tu trabajo, o como paso previo si toca la pantalla de
edición/miembros de hogar.**

**Cuando se resuelva: borrar el párrafo anterior (el que dice "todavía
falta implementar") y actualizar esta entrada para reflejar la solución
realmente aplicada — no dejar los dos mensajes conviviendo.**
