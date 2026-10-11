# Incidentes y soluciones — Sprint 9

Registro de los problemas no triviales encontrados mientras se armaba el
ABM de usuarios (admin), la alerta de stock mínimo y los filtros "Por
vencer"/"Stock bajo" (rama `feature/abm-usuarios-stock-minimo`, apilada sobre
el PR #13). Mismo espíritu que
[incidentes-sprint1.md](incidentes-sprint1.md) a
[incidentes-sprint8.md](incidentes-sprint8.md): que si un error parecido
vuelve a aparecer, no haya que redescubrirlo de cero.

Migración nueva:
[20261011120000_abm_usuarios_y_habilitado.sql](../supabase/migrations/20261011120000_abm_usuarios_y_habilitado.sql).

---

## 1. Cualquier usuario podía hacerse administrador a sí mismo

**Síntoma:** ninguno visible desde la app. Se encontró auditando la base
real antes de programar el ABM de usuarios (`pg_policies` y los permisos por
columna de `usuarios`), no probando pantallas.

**Causa raíz:** la policy de UPDATE de `usuarios` era:
```sql
create policy "usuarios_update_propio_o_admin" on public.usuarios for update
  using (id = auth.uid() or es_administrador())
  with check (id = auth.uid() or es_administrador());
```
Solo validaba "es tu fila", y `authenticated` tenía UPDATE sobre **todas** las
columnas (el default de Supabase). Desde el cliente, cualquier usuario
logueado podía hacer:
```ts
supabase.from('usuarios').update({ rol: 'administrador' }).eq('id', miId)
```
y con eso ver y tocar los datos de todos los hogares. Con el mismo UPDATE
podía además:
- volver a ponerse `habilitado = true` si un admin lo deshabilitaba (lo que
  dejaba sin sentido el ABM de usuarios que se estaba por armar), y
- cambiar su `hogar_id` por el de un hogar ajeno: las policies de
  `productos` aceptan `hogar_id = hogar_id_actual()`, así que alcanzaba con
  conocer el id de un hogar para ver y editar su inventario sin ser miembro.

Es exactamente el patrón ya visto en
[incidentes-sprint2.md](incidentes-sprint2.md) #1: una policy que solo
valida "esto es mío" sin validar qué se está cambiando.

**Solución:** revocar el UPDATE a nivel tabla y dejar solo la columna
`nombre` (para una futura pantalla de perfil). La app nunca hacía UPDATE
directo sobre `usuarios` (el hogar activo lo cambian RPCs `SECURITY
DEFINER`), así que no se rompe nada. `rol` y `habilitado` se cambian solo con
las RPCs nuevas `admin_set_rol_usuario` / `admin_set_usuario_habilitado`, que
validan `es_administrador()` del lado del servidor.

**Cómo evitar que vuelva a pasar:** cada vez que una tabla tenga una policy
de UPDATE "propia" (`id = auth.uid()`), revisar qué columnas quedan
editables. Si hay alguna que define permisos (rol, habilitado, hogar,
estado), revocarla a nivel columna y moverla a una RPC.

---

## 2. `usuarios.habilitado` existía desde el Sprint 1 pero nadie lo miraba

**Síntoma:** ninguno todavía (no había forma de deshabilitar a nadie), pero el
plan de testing del Sprint 8 pide que deshabilitar un usuario lo bloquee "de
verdad, no solo visualmente".

**Causa raíz:** la columna se creó pensando en RF9, pero ninguna policy ni
RPC la consultaba.

**Solución (en la base, no en la app):**
- `usuario_habilitado()` nueva (`SECURITY DEFINER`, `search_path` fijo — se
  usa dentro de los helpers de RLS de `usuarios`; sin eso entra en recursión,
  ver [incidentes-sprint1.md](incidentes-sprint1.md) #7).
- `es_administrador`, `es_miembro_de`, `es_dueno_de` y `hogar_id_actual`
  exigen cuenta habilitada. Como todas las policies y casi todas las RPCs
  pasan por esos cuatro, una cuenta deshabilitada deja de ver hogares,
  miembros, productos y actividad **en el momento**, aunque su token de
  sesión siga vigente.
- Las RPCs que escriben sin pasar por esos helpers (`crear_hogar`,
  `unirse_a_hogar`, `responder_invitacion`, `salir_de_hogar`) son `SECURITY
  DEFINER` y se saltean la RLS. En vez de reescribir cada una, un trigger
  `BEFORE` en `hogares`, `hogar_miembros`, `productos` y `productos_catalogo`
  frena cualquier escritura de una cuenta deshabilitada (los triggers corren
  igual dentro de una función `SECURITY DEFINER`).
- La fila propia de `usuarios` se sigue pudiendo leer: así la app sabe que
  está deshabilitada y muestra `CuentaDeshabilitadaScreen`. Realtime publica
  `usuarios` para que eso pase al instante si la deshabilitan con la app
  abierta (sin lista de columnas, ver [incidentes-sprint4.md](incidentes-sprint4.md) #4).

**Comportamiento esperado (pedido por el plan de testing):** el acceso a los
datos se corta **en el momento**, con la sesión abierta. La pantalla cambia
al instante por Realtime; si Realtime no llega (red), cambia en la próxima
carga del perfil (abrir la app, refresco del token). Loguearse con una cuenta
deshabilitada funciona (Google la autentica) pero lo único que se ve es
"Cuenta deshabilitada".

**Limitaciones conocidas (no resueltas acá):**
- Las Edge Functions (`ocr-ticket`, `vencimiento-foto`, `voz-a-texto`) solo
  validan el JWT, no `habilitado`: una cuenta deshabilitada con la sesión
  abierta podría seguir gastando cuota de OCR/Gemini llamándolas a mano (no
  puede guardar nada con lo que devuelvan). Si importa, chequear
  `usuario_habilitado()` al principio de cada función.
- Subir una foto al bucket `catalogo-sugerencias` tampoco mira `habilitado`
  (la sugerencia en sí sí queda bloqueada por el trigger).

---

## 3. Un admin podía dejarse afuera a sí mismo

**Síntoma:** caso de diseño, detectado al escribir las RPCs.

**Causa:** sin una guarda, un admin podía deshabilitar su propia cuenta o
quitarse el rol, y si era el único, la plataforma quedaba sin nadie que
pudiera revertirlo desde la app.

**Solución:** las dos RPCs rechazan esos casos (`No podés deshabilitar tu
propia cuenta` / `No podés quitarte el rol de administrador a vos mismo`), y
la pantalla tampoco ofrece acciones sobre la fila propia. Dos guardas
independientes, mismo criterio que `expulsar_miembro` con el dueño.

---

## Notas de diseño (no son bugs, pero conviene dejarlas escritas)

- **Stock mínimo por producto, no por lote:** la alerta compara el total de
  todos los lotes de un producto (misma agrupación que la lista,
  `agruparProductos`) contra el mayor mínimo cargado entre sus lotes. Con 1
  leche que vence mañana y 4 que vencen en un mes, con mínimo 3 no falta
  leche.
- **"Por debajo" es estricto:** con mínimo 3, tener 3 no alerta; 2 sí. Sin
  mínimo cargado (0) nunca hay alerta, ni con cantidad 0.
- **Colores:** stock bajo usa `stockStatus.low` (ámbar, con texto oscuro);
  vencimientos siguen en coral (`critical`/`expired`). No se confunden.
- **"Alta" de usuarios:** no hay. Las cuentas se crean solas al loguearse con
  Google; el ABM del admin es listar, deshabilitar/habilitar (baja lógica,
  no se borra nada) y cambiar el rol.

---

## Errores de proceso

1. **`main` desactualizado respecto del trabajo real.** Al arrancar,
   `main` estaba 41 commits atrás del PR #13 (Sprints 5-8 sin mergear). La
   alerta de stock toca los mismos archivos (`ProductosScreen`,
   `productos.ts`), así que partir de `main` garantizaba conflictos. Se
   decidió con el equipo apilar esta rama sobre
   `feature/escanear-ticket-vencimiento` (mismo esquema que #10 → #13); el PR
   apunta a esa rama y GitHub lo reapunta a `main` cuando se mergee #13.
2. **Prueba de la migración con funciones en `pg_temp`:** la primera
   simulación por SQL (todo dentro de una transacción que se revierte)
   falló con `schema "pg_temp" does not exist` (no se puede crear funciones
   ahí antes de que exista una tabla temporal en la sesión). Se confirmó que
   no quedó nada aplicado (todo se revirtió).
3. **Heredoc de bash con comillas:** igual que
   [incidentes-sprint5-6.md](incidentes-sprint5-6.md) #11, un script de
   edición pasado por heredoc falló con `unexpected EOF`. Se escribió el
   script a un archivo con la herramienta de edición directa.
