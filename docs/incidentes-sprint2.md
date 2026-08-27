# Incidentes y soluciones — Sprint 2

Registro de los problemas encontrados durante la revisión de QA del
[PR #1](https://github.com/Trainx12/Stocky/pull/1) — "Dashboard de Home
y soporte de multi-hogar" (Julieta), antes de mergear a `main`. Mismo
espíritu que [docs/incidentes-sprint1.md](incidentes-sprint1.md): que si
un error parecido vuelve a aparecer, no haya que redescubrirlo de cero.

Los dos se detectaron durante el flujo de rama + PR + QA que se
documentó en `AGENTS.md` a partir de este sprint — es justamente el tipo
de problema que ese flujo está pensado para agarrar antes de que llegue
a `main`.

Para la configuración vigente (no el historial), ver [README.md](../README.md).

---

## 1. Bypass del código de invitación al unirse a un hogar

**Síntoma:** ninguno visible desde la UI — se encontró leyendo el código
de la migración durante la revisión de QA, no probando la app.

**Causa raíz:** la policy de RLS para dar de alta una fila en
`hogar_miembros` era:
```sql
create policy "hogar_miembros_insert_propio"
  on public.hogar_miembros for insert
  to authenticated
  with check (usuario_id = auth.uid());
```
Solo validaba que estuvieras insertando **tu propia** membresía — no
validaba que hubieras pasado por `unirse_a_hogar()` (la función que sí
chequea el código de invitación). Como Supabase le da permisos de
INSERT/UPDATE/DELETE a nivel tabla a `authenticated` por default, y la
RLS era la única barrera, **cualquier usuario logueado podía sumarse a
un hogar ajeno insertando su membresía directo desde el cliente**
(`supabase.from('hogar_miembros').insert(...)`), sin conocer el código
de invitación — con solo saber (o adivinar) el `hogar_id`.

**Solución:** revocar el INSERT directo a nivel tabla para
`authenticated`/`anon` sobre `hogar_miembros`, y dejar que **solo** las
RPCs (`crear_hogar`, `unirse_a_hogar`, que son `SECURITY DEFINER` y
bypasean la RLS) puedan crear filas ahí:
```sql
drop policy if exists "hogar_miembros_insert_propio" on public.hogar_miembros;
revoke insert on public.hogar_miembros from authenticated, anon;
```
Mismo patrón que ya se había usado en Sprint 1 con
`handle_new_auth_user` (ver incidentes-sprint1.md): una función
`SECURITY DEFINER` es la única vía de entrada legítima, y se le revoca
el acceso directo a cualquier otra.

De paso se corrigió también `generar_codigo_invitacion()`, que no tenía
`search_path` fijo (mismo warning cosmético de seguridad ya visto en
Sprint 1).

---

## 2. Un admin veía "sus" hogares mezclados con los de cualquier usuario

**Síntoma:** logueado con la cuenta admin, la sección "Tus hogares
activos" de Home mostraba hogares de otras cuentas (el de Julieta, y el
de otra cuenta de prueba), sin que la cuenta admin fuera miembro de
ninguno de los dos. Se encontró probando la app a mano, no con ningún
chequeo automático.

**Causa raíz:** `listarMisHogares()` hacía esta consulta sin filtrar por
usuario, confiando en que la RLS "por sí sola" iba a traer solo lo
propio:
```ts
supabase.from('hogar_miembros').select('hogares(*)').order('created_at', ...)
```
La policy de SELECT de `hogar_miembros` incluye `es_administrador()`
como una de las condiciones (intencional, para RF9/RF10 — un admin tiene
que poder ver todo). El problema es que esta función **no distinguía**
entre "la RLS me deja ver esto" y "esto es específicamente lo mío": al
no tener un `.eq('usuario_id', ...)` explícito, una cuenta admin recibía
**todas** las filas de `hogar_miembros` de **todos** los usuarios, y la
pantalla las mostraba como si fueran del usuario logueado.

No es una fuga de seguridad (la RLS le da esa visibilidad al admin a
propósito) — es un bug de lógica de la query: una función que se llama
"mis hogares" tiene que filtrar explícitamente por el usuario actual,
sin importar cuán permisiva sea la RLS para ese rol en particular.

**Solución:** agregar el filtro explícito, obteniendo primero el id del
usuario logueado:
```ts
const { data: userData } = await supabase.auth.getUser();
const userId = userData.user?.id;
// ...
.from('hogar_miembros').select('hogares(*)').eq('usuario_id', userId)...
```

---

## Por qué estos dos importan más allá de este PR puntual

Los dos comparten la misma lección: **la RLS es una red de seguridad,
no un reemplazo de pensar la query/policy con cuidado.** Ninguno de los
dos apareció al correr `tsc`, los tests, o `expo-doctor` — el primero se
encontró leyendo el SQL con atención, el segundo probando la app a mano
con una cuenta admin real. Ninguna herramienta automática los iba a
agarrar solos; hicieron falta ambos pasos de revisión humana que ya
están en [docs/plan-de-testing.md](plan-de-testing.md).

## Estado actual (para referencia rápida)

- `hogar_miembros` no acepta INSERT directo desde el cliente para
  ningún rol — únicamente vía `crear_hogar()` / `unirse_a_hogar()`.
- `listarMisHogares()` siempre filtra por el usuario logueado,
  independientemente de su rol.
- Ambos fixes quedaron en el mismo PR (#1) que la funcionalidad
  original, documentados en los comentarios del PR y ya mergeados a
  `main`.
