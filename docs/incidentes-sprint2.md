# Incidentes y soluciones — Sprint 2

Registro de los problemas encontrados durante la revisión de QA del
[PR #1](https://github.com/Trainx12/Stocky/pull/1) — "Dashboard de Home
y soporte de multi-hogar" (Julieta), antes de mergear a `main`, más uno
posterior al probar la app en el celular. Mismo espíritu que
[docs/incidentes-sprint1.md](incidentes-sprint1.md): que si un error
parecido vuelve a aparecer, no haya que redescubrirlo de cero.

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

---

## 3. `npx expo start` para celular falla si ya hay otro Metro corriendo en el 8081

**Síntoma:** al correr `npx expo start` (o `--dev-client`) para levantar la
app en el celular mientras ya había otro `npx expo start --web` corriendo
(por ejemplo, el servidor de la pantalla web abierto antes), el comando
nuevo terminaba enseguida con:
```
› Port 8081 is being used by another process
Input is required, but 'npx expo' is in non-interactive mode.
Required input:
> Use port 8082 instead?
› Skipping dev server
```
Sin QR, sin servidor levantado — el proceso se cierra solo.

**Causa raíz:** los dos comandos (`--web` y el normal para celular) usan
el mismo puerto por default (8081) para Metro Bundler. Cuando ya hay una
instancia corriendo ahí, Expo CLI le pregunta al usuario si quiere usar
otro puerto — pero si el comando se ejecuta en un contexto no
interactivo (una terminal que no puede recibir esa confirmación), no hay
quién responda esa pregunta y el CLI directamente aborta en vez de
levantar el servidor.

**Solución:** indicar un puerto distinto a mano con `--port`, en vez de
depender de que el CLI pregunte y lo asigne solo:
```bash
npx expo start --port 8082
```
(o `npx expo start --dev-client --port 8082` si se usa el development
build). En una terminal interactiva normal, también alcanza con
responder "Sí" a la pregunta del puerto — el problema es específico de
contextos donde esa pregunta no se puede contestar.

---

## 4. El servidor web se cae sin aviso y queda como si "la app estuviera rota"

**Síntoma:** después de tenerlo andando un buen rato, `http://localhost:8081`
dejó de responder — la sensación desde afuera es "se cayó la versión web",
como si algo del código la hubiera roto.

**Causa raíz:** no fue un bug de código. El proceso de Metro
(`npx expo start --web`) simplemente había dejado de estar corriendo —
confirmado con `netstat -ano` (nada escuchando en el puerto 8081) — sin
que quedara registrado ningún error asociado. No se identificó por qué se
cerró (pudo ser el propio entorno donde corre el servidor, no algo
reproducible desde el código de la app).

**Solución:** antes de asumir que hay un bug, confirmar si el servidor
sigue vivo:
```bash
netstat -ano | grep ":8081"
```
Si no hay nada escuchando, simplemente se vuelve a levantar
(`npx expo start --web`) — no hace falta tocar código. `tsc`, los tests y
el bundler seguían todos en verde antes y después, así que quedó
descartado como problema de la app.

---

## 5. El QR de `npx expo start` no se puede escanear cuando lo corre Claude

**Síntoma:** al pedirle a Claude que levante `npx expo start` para
conseguir el QR y escanearlo con el celular, el comando arranca bien
(Metro queda escuchando y accesible en la red local), pero **el QR nunca
aparece** en la salida que Claude puede leer.

**Causa raíz:** el QR de Expo CLI se dibuja con caracteres de control de
terminal (arte ASCII) que solo se renderizan en una terminal interactiva
real (TTY). El entorno donde Claude corre comandos en segundo plano no
tiene una TTY real, así que esa parte de la salida directamente no se
genera (no es que se pierda al leerla: el proceso nunca la escribe).

**Solución:** en vez de depender del QR, conectarse a mano desde Expo Go
con la URL exacta, armada con la IP local de la PC (`ipconfig` → IPv4) y
el puerto del servidor:
```
exp://<IP-local-de-la-PC>:<puerto>
```
Por ejemplo `exp://192.168.18.11:8082`. Si se necesita ver el QR real
(por comodidad, no porque la URL manual no alcance), hay que correr
`npx expo start` desde una terminal propia, no pedírselo a Claude.

---

## Estado actual (para referencia rápida)

- `hogar_miembros` no acepta INSERT directo desde el cliente para
  ningún rol — únicamente vía `crear_hogar()` / `unirse_a_hogar()`.
- `listarMisHogares()` siempre filtra por el usuario logueado,
  independientemente de su rol.
- Ambos fixes (1 y 2) quedaron en el mismo PR (#1) que la funcionalidad
  original, documentados en los comentarios del PR y ya mergeados a
  `main`.
- Si vas a correr la app en web y en celular al mismo tiempo (dos
  `expo start` en paralelo), acordate de pasarle `--port` a uno de los
  dos para que no choquen en el 8081.
- Si "se cae" el servidor web sin ningún cambio de código de por medio,
  revisar primero si el proceso sigue corriendo (`netstat`) antes de
  buscar un bug — lo más probable es que solo haya que reiniciarlo.
- Para conectar el celular vía Expo Go sin pasar por el QR (por ejemplo,
  si te lo levanta Claude), usar la URL manual `exp://<IP local>:<puerto>`.
