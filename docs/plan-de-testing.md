# Plan de testing — rutas críticas por sprint

Este documento define, para cada sprint del roadmap, la ruta crítica que
tiene que funcionar sí o sí, qué debería probar el desarrollo antes de
dar algo por terminado, y qué debería probar QA antes de aceptar el
sprint. También explica qué puede testear Claude directamente y dónde
hace falta un humano.

No reemplaza el criterio de aceptación de cada historia de usuario — es
el mapa de "qué no puede romperse" para no tener que redescubrirlo cada
vez.

---

## Cómo leer cada sprint

- **Ruta crítica**: la secuencia mínima de pasos que, si falla, bloquea
  todo lo demás. Si un sprint tiene más de una ruta crítica, se numeran.
- **Testing de quien desarrolla**: lo que se prueba *mientras* se
  programa, antes de pasarlo a revisión. Los roles de desarrollo y QA
  rotan entre el equipo — esto es responsabilidad de quien esté
  programando esa funcionalidad puntual, sea quien sea ese sprint, no
  de quien vaya a revisarla después.
- **Testing de quien esté de turno como QA**: lo que se prueba
  *después*, con la funcionalidad ya integrada, buscando romperla y
  verificando que no rompió nada de sprints anteriores (regresión). Al
  rotar los roles, quien revisa un sprint puede ser quien programó el
  anterior — igual tiene que probarlo con la misma exigencia que si
  fuera código de otra persona.
- **Regresión obligatoria**: rutas críticas de sprints *anteriores* que
  QA tiene que volver a correr en este sprint, porque el código nuevo
  pudo haberlas afectado sin que nadie lo note (el ejemplo que diste vos:
  el OCR rompe el ingreso manual, y quien lo programó no se da cuenta
  porque no está mirando esa pantalla).

---

## Sprint 1 — Init, login Google, roles base, onboarding (RF0, RF1)

**Ruta crítica:**
1. Abrir la app sin sesión → ve Welcome.
2. Welcome → Onboarding (3 pasos) → Login.
3. Login con Google → vuelve autenticado a Home.
4. Cerrar sesión → vuelve a Welcome.
5. Cerrar la app y reabrirla con sesión activa → entra directo a Home
   (no debería pedir loguearse de nuevo).

**Testing de quien desarrolla:**
- Probar el flujo completo al menos una vez en el development build de
  expo.dev instalado en un celular real, no solo en web.
- Verificar en Supabase (Table Editor) que el login crea la fila en
  `usuarios` con el rol y email correctos.
- Probar qué pasa si se cancela el login a mitad de camino (no debería
  romper la app ni dejarla en un estado raro).

**Testing de QA:**
- Repetir el flujo completo en un dispositivo limpio (sin caché/sesión
  previa).
- Probar con una cuenta de Google que **no** esté en la lista de test
  users (debe fallar con un mensaje claro, no un crash).
- Cerrar sesión y volver a entrar con una cuenta distinta — confirmar
  que no queda mezclado ningún dato de la sesión anterior.
- Girar el celular (portrait/landscape) en cada pantalla del onboarding.

**Regresión obligatoria en sprints siguientes:** login + logout deben
seguir funcionando en TODOS los sprints de acá en adelante — es la
puerta de entrada a todo lo demás.

---

## Sprint 2 — ABM de hogar, invitar usuarios, resumen (RF5, RF6)

**Ruta crítica:**
1. Usuario sin hogar → crear hogar → aparece como su hogar activo.
2. Invitar a otro usuario (por email) → el invitado ve el hogar en su
   cuenta.
3. Editar nombre del hogar → se refleja para todos los miembros.
4. Eliminar/salir del hogar → dejás de ver sus datos.

**Testing de quien desarrolla:**
- Confirmar que las policies de RLS de `hogares` siguen andando después
  de cualquier cambio (correr `get_advisors` de seguridad si se tocó
  una migración).
- Probar la invitación con un email que no tiene cuenta creada todavía.
- Probar qué pasa si dos personas intentan editar el hogar al mismo
  tiempo (no es crítico resolverlo bien en sprint 2, pero no debería
  crashear).

**Testing de QA:**
- Con dos cuentas reales (dos celulares o el mismo con logout/login),
  confirmar que un usuario **no puede ver ni editar** el hogar de otro
  al que no fue invitado (probar entrando directo si hay algún ID en
  una URL/deep link).
- Invitar, aceptar, y verificar que el que invitó ve al nuevo miembro en
  la pantalla principal.
- Sacar a alguien del hogar y confirmar que pierde acceso inmediato (no
  solo visualmente, sino que una query directa a la API también le
  niegue el acceso — esto se puede pedir que lo verifique Claude por
  SQL/RLS).

**Regresión obligatoria:** ruta crítica del Sprint 1 completa.

**Actualización (aceptar/rechazar invitados):** unirse a un hogar por
código ya no suma como miembro directo -- queda como solicitud pendiente
hasta que el dueño la acepte o la rechace (ver migración
20260903120000_solicitudes_hogar.sql). Sumar a la ruta crítica de arriba:
1. Invitado manda el código → ve "Solicitud enviada" en su cuenta, NO
   aparece todavía en "Tus hogares activos" ni puede ver productos/nombre
   del hogar (probar entrando directo si conoce el `hogar_id`).
2. Dueño abre "Miembros del hogar" → ve al invitado en "Solicitudes
   pendientes" → lo acepta → el invitado se entera al instante (Realtime,
   sin recargar) y el hogar pasa a aparecer en su "Tus hogares activos".
3. Repetir el punto 2 pero rechazando → el invitado se entera al instante
   ("Solicitud rechazada") y puede volver a mandar el código.
4. Confirmar que expulsar a un miembro ya aceptado y rechazar una
   solicitud pendiente muestran mensajes distintos del lado del invitado
   (no deberían confundirse, aunque ambos borran la fila).

---

## Sprint 3 — ABM de productos, listado con búsqueda/filtros (RF7)

**Ruta crítica:**
1. Crear un producto (nombre, categoría, unidad, cantidad) → aparece en
   el listado del hogar.
2. Editar cantidad/categoría → se refleja en el listado.
3. Eliminar un producto → desaparece del listado.
4. Buscar por nombre → filtra correctamente.
5. Filtrar por categoría → solo muestra esa categoría.

**Testing de quien desarrolla:**
- Probar con cantidades en 0, negativas (debería rechazarse o
  clampearse, no romper la UI) y números muy grandes.
- Probar el buscador con texto vacío, con acentos, y con mayúsculas.
- Confirmar que un producto creado en un hogar no aparece en el listado
  de otro hogar (esto es RLS, pedirle a Claude que lo confirme por SQL
  es más rápido que hacerlo a mano con dos cuentas).

**Testing de QA:**
- Cargar ~20-30 productos y confirmar que el listado/búsqueda siguen
  siendo usables (no es una prueba de performance formal, solo "no se
  rompe con datos reales").
- Editar y eliminar productos desde dos sesiones distintas del mismo
  hogar en simultáneo.
- Probar los filtros combinados (búsqueda + categoría a la vez).

**Regresión obligatoria:** Sprint 1 + Sprint 2 (login, ABM de hogar,
invitaciones).

**Verificado por Claude en esta implementación:** `tsc --noEmit` limpio,
`npm test` sin errores (16 tests nuevos de `productos.ts`, incluida la
validación de nombre vacío y cantidades negativas), la app sigue
bundleando y renderizando Welcome sin errores de consola en
`expo start --web`. No se tocó ninguna migración/policy (la RLS de
`productos` ya existía desde el Sprint 1, ver `enable_rls` y
`hogares_multi_membresia`), así que no hizo falta correr `get_advisors`
de nuevo. **Pendiente de un humano:** todo lo de la ruta crítica en sí
(crear/editar/eliminar un producto, buscar, filtrar por categoría) --
requiere login real con una cuenta que ya tenga un hogar, que Claude no
puede hacer por sí solo.

---

## Sprint 4 — Vencimientos, deshabilitar alerta, aviso visual (RF2, RF3)

**Ruta crítica:**
1. Cargar fecha de vencimiento a un producto → se guarda.
2. Producto próximo a vencer → aparece resaltado/con alerta visual en el
   listado (según los umbrales de color definidos en el theme:
   verde/amarillo/rojo).
3. Deshabilitar el seguimiento de vencimiento en un producto puntual →
   deja de generar alerta, aunque tenga fecha cargada.
4. Producto sin fecha de vencimiento → no genera ninguna alerta (no
   debe romper ni mostrar "vencido" por error).

**Testing de quien desarrolla:**
- Probar fechas límite: hoy, ayer (ya vencido), muy en el futuro, y
  fecha inválida/vacía.
- Confirmar que **no** rompió el ABM de productos del Sprint 3 (agregar
  un campo a un producto existente es un lugar típico donde se rompe
  algo que no se está mirando).

**Testing de QA:**
- Esta es la primera vez que aparece un problema real de "tiempo": QA
  tiene que probar con la fecha del dispositivo cambiada (adelantada,
  atrasada) para ver cómo reacciona la alerta.
- Confirmar que deshabilitar la alerta de un producto no afecta a los
  demás productos del mismo hogar.
- **Regresión completa de ABM de productos (Sprint 3):** crear, editar,
  eliminar, buscar, filtrar — con productos que ahora también tienen
  fecha de vencimiento cargada.

**Regresión obligatoria:** Sprints 1, 2 y 3 completos.

---

## Sprint 5 — Evaluación de APIs de OCR (sin feature nueva)

No hay ruta crítica de usuario (es un sprint de investigación/decisión
técnica, no de funcionalidad visible). Lo que sí conviene documentar
como "testing":

- Definir y dejar por escrito el **criterio de aceptación mínimo** del
  OCR — esto lo arma el equipo, no es un test automatizable.

**Criterio de aceptación mínimo (definido):**
- `ocr-ticket`: al menos el **70% de los tickets** del set de QA deben
  producir por lo menos un producto con nombre y cantidad reconocidos
  correctamente, sin que el usuario tenga que tipear todo a mano. No
  hace falta más porque ya existe la pantalla de revisión donde el
  usuario edita/borra antes de confirmar (Sprint 6): el objetivo del
  OCR es ahorrar tipeo en la mayoría de los casos, no reemplazar al
  usuario. Un 30% de fallos se corrige a mano y sigue siendo más
  rápido que cargar todo manualmente.
- `vencimiento-foto`: al menos el **60% de las fotos** deben devolver
  la fecha de vencimiento correcta (coincide exactamente con lo que
  lee una persona), Y el modelo **nunca debe devolver una fecha
  incorrecta con confianza** cuando no está seguro — tiene que poder
  decir "no encontré la fecha". Acá el riesgo no es la molestia de
  tipear de nuevo (como en el ticket): una fecha de vencimiento
  equivocada que el usuario no revisa con atención puede llevar a
  tirar comida buena o comer algo vencido. Por eso "nunca alucinar con
  confianza" pesa más que el porcentaje de aciertos.

- QA debería juntar un set de ~10-15 fotos de tickets reales (variados:
  arrugados, con mala luz, distintos supermercados) para usar como caso
  de prueba en el Sprint 6, no esperar a tenerlas recién ahí.

**Decisión tomada (proveedores por función):**
- `ocr-ticket` (texto de tickets) → **OCR.space**. Es texto plano con
  buen contraste, el caso donde un OCR clásico rinde bien sin necesitar
  "entendimiento" de la imagen. Free tier: 25.000 requests/mes.
- `vencimiento-foto` (fecha de vencimiento en el envase) → **Gemini
  Flash** (hoy `gemini-3.8-flash`; ver nota abajo). Un OCR clásico no distingue la fecha de vencimiento de
  otros números impresos en el envase (lote, código de barras); un
  modelo de visión permite pedir explícitamente "encontrá la fecha de
  vencimiento" en vez de solo extraer texto crudo.

**Límite real medido del free tier de Gemini Flash** (cuenta de
Google AI Studio, verificado en aistudio.google.com/rate-limit el
2026-09-14 para 2.5 Flash y el 2026-10-04 para 3.8 Flash, mismos valores
en ambos): **5 RPM, ~250K TPM, 20 RPD**. El RPD
de 20 solicitudes/día (total del proyecto, no por usuario) alcanza sin
problema para la evaluación del Sprint 5, pero es una limitación real
a resolver en el Sprint 6: si el uso en producción supera 20 fotos de
vencimiento por día, va a hacer falta habilitar facturación en el
proyecto de Google Cloud (Flash sigue siendo muy barato en el tier
pago) o limitar el uso mientras se esté en el tier gratuito.

**Cambio de modelo (2026-10-04):** `gemini-2.5-flash` empezó a devolver 404
("ya no está disponible para usuarios nuevos"), así que `vencimiento-foto`
pasó a `gemini-3.8-flash`. El modelo se cambia sin tocar código con el
secret `GEMINI_MODEL` (`supabase secrets set GEMINI_MODEL=...`): Google
retira modelos viejos con el tiempo, así que si vuelve a fallar con 404 en
los logs de la función, es lo primero a revisar.

---

## Sprint 6 — Integración OCR, parseo, UI de revisión/confirmación (RF4)

**Ruta crítica:**
1. Sacar foto de un ticket → la Edge Function `ocr-ticket` devuelve
   productos candidatos.
2. Pantalla de revisión: el usuario puede editar/eliminar cada producto
   candidato antes de confirmar.
3. Confirmar → los productos se guardan en el hogar (mismo flujo que un
   alta manual del Sprint 3).
4. Ticket ilegible / OCR sin resultados → mensaje claro, plan B
   (mostrar texto crudo o permitir carga manual), nunca una pantalla en
   blanco o un crash.

**Testing de quien desarrolla:**
- Probar con el set de tickets que juntó QA en el Sprint 5.
- Simular que la Edge Function devuelve error (network, timeout) y
  confirmar que la UI no se cuelga.
- **Esto es justo el escenario que mencionaste vos:** antes de dar por
  cerrado este sprint, quien lo desarrolla tiene que volver a probar el alta
  **manual** de productos (Sprint 3) para confirmar que agregar la
  pantalla de OCR no rompió el flujo manual (por ejemplo, si ambos
  flujos terminan llamando a la misma función de guardar producto y se
  le cambió la firma).

**Testing de QA:**
- Confirmar que el alta manual de productos (Sprint 3) sigue
  funcionando igual — no asumir que ya se probó bien solo porque lo
  hizo la misma persona que después revisa.
- Probar cancelar la confirmación a mitad de camino (no debería guardar
  nada parcial).
- Fotos en mal estado, tickets no argentinos/formato raro, fotos que no
  son tickets (una selfie, por ejemplo) — confirmar que no rompe nada,
  aunque el OCR no entienda la imagen.

**Regresión obligatoria:** Sprints 1 a 4 completos, con foco extra en
**ABM manual de productos (Sprint 3)**, por lo explicado arriba.

---

## Sprint 7 — Evaluación de voz + ABM por audio (RF8, parcial)

Igual que el Sprint 5: evaluación técnica de APIs, más la primera
versión de ABM de productos por voz.

**Ruta crítica (para la parte de ABM por voz):**
1. Grabar audio pidiendo agregar un producto → se interpreta la acción y
   el producto correctamente.
2. Confirmar antes de guardar (mismo patrón que el OCR: nunca guardar
   directo sin que el usuario revise).
3. Audio ambiguo o inentendible → mensaje claro, no guarda nada al
   azar.

**Testing de quien desarrolla:**
- Repetir la misma verificación cruzada del Sprint 6: agregar el flujo
  de voz no debe romper ni el alta manual (Sprint 3) ni el alta por
  OCR (Sprint 6).

**Testing de QA:**
- Regresión de manual + OCR, ahora con voz como tercera vía de entrada
  al mismo dato (`productos`).
- Probar con ruido de fondo, acentos distintos, frases ambiguas ("sacá
  la leche" vs "agregá la leche").

**Regresión obligatoria:** Sprints 1 a 6 completos.

---

## Sprint 8 — Voz para vencimiento, ABM de usuarios (admin), stock mínimo (RF8 cont., RF9 parcial)

**Ruta crítica:**
1. Cargar fecha de vencimiento por voz → mismo resultado que cargarla a
   mano (Sprint 4).
2. Admin ve la lista de usuarios de la plataforma.
3. Admin deshabilita un usuario → ese usuario no puede seguir usando la
   app (no solo visualmente: RLS/Auth debe bloquearlo de verdad).
4. Producto por debajo de `stock_minimo` → genera alerta visual
   distinta a la de vencimiento (no deberían confundirse en el theme).

**Testing de quien desarrolla:**
- Confirmar que deshabilitar un usuario efectivamente le corta el
  acceso (probar con la sesión de ese usuario ya abierta: ¿se corta en
  el momento, o recién en el próximo login?, documentar cuál es el
  comportamiento esperado).
- Regresión cruzada: vencimiento por voz no debe romper vencimiento
  manual (Sprint 4).

**Testing de QA:**
- Intentar loguearse con una cuenta ya deshabilitada.
- Confirmar que un usuario `usuario` normal no puede ver la pantalla de
  ABM de usuarios (ni por UI ni forzando la navegación).
- Producto con cantidad justo en el límite de `stock_minimo` (probar
  el valor exacto, uno arriba, uno abajo — clásico error de "menor" vs
  "menor o igual").

**Regresión obligatoria:** Sprints 1 a 7 completos.

**Lo que efectivamente se implementó en el Sprint 8** (PR #13; detalle y
errores en [incidentes-sprint8.md](incidentes-sprint8.md)): ABM de
productos y vencimientos por voz con Gemini, lotes agrupados en la lista,
lupa → buscador, sugerir productos con foto y fotos para todo el catálogo.
ABM de usuarios (admin) y alerta de stock mínimo **no** entraron: quedan
para el sprint siguiente. Checklist de QA para lo que sí entró:

- Voz (requiere build nuevo del dev client: `expo-audio` es nativo):
  - "Compré 2 leches La Serenísima que vencen el 15 de noviembre" → alta
    con marca, cantidad y fecha; "usé 3 huevos" → resta; "eliminá el
    yogur" → baja; "la manteca vence el viernes" → cambio de fecha.
  - "Sacá la leche" (baja) vs. "sacá una leche" (resta 1).
  - Producto que no está en la despensa → aviso, no se aplica.
  - Audio vacío o con ruido → "No entendimos", no guarda nada.
  - Cancelar la revisión → no guarda nada parcial.
  - Permiso de micrófono denegado → mensaje claro.
  - Respuesta en pocos segundos (si tarda más de ~10 s, mirar los logs de
    `voz-a-texto`: indican qué modelo respondió y en cuánto).
- Fecha dictada en el formulario → mismo resultado que cargarla a mano.
- Lotes: dos lotes del mismo producto (uno con marca y otro sin) se ven en
  una sola tarjeta con el total; +/−, editar y eliminar actúan solo sobre
  ese lote; a 360 px de ancho ningún renglón se parte en dos líneas.
- La lupa de la barra de abajo abre el buscador con el teclado.
- Sugerir producto: desde Home y desde el pie del selector del catálogo,
  con foto (cámara y galería) y sin foto; el admin ve la foto, al aprobar
  aparece en el catálogo y al rechazar desaparece. Un usuario común no
  puede aprobar.
- El catálogo muestra foto en los 257 productos; "Achicoria" reemplaza a
  "Radicheta".

---

## ABM de usuarios + stock mínimo (pendientes del Sprint 8, entran en el 9)

Rama `feature/abm-usuarios-stock-minimo` (PR apilado sobre el #13). Detalle y
decisiones en [incidentes-sprint9.md](incidentes-sprint9.md). **Requiere la
migración `20261011120000_abm_usuarios_y_habilitado.sql` aplicada** en el
proyecto de Supabase antes de probar (ver incidentes-sprint3 #4 y sprint4 #1).

**Ruta crítica:** la del Sprint 8 puntos 2 a 4 (admin ve la lista, deshabilita
→ el usuario queda bloqueado de verdad, alerta de stock distinta a la de
vencimiento), más:
1. Home muestra como máximo 4 productos por vencer y 4 de stock bajo, con
   "Ver todos" → abre la despensa con el filtro ya aplicado.
2. En la despensa, el chip "Por vencer" muestra TODOS los productos con fecha
   de vencimiento cargada (vencidos, próximos, lejanos y también los que
   tienen la alerta apagada), en el orden en que vencen; los que no tienen
   fecha no aparecen. "Stock bajo" deja solo los productos por debajo del
   mínimo. Tocar el chip de nuevo lo saca.

**Comportamiento esperado al deshabilitar con la sesión abierta:** los datos
se cortan en el momento (la base rechaza todo); la pantalla pasa a "Cuenta
deshabilitada" al instante (Realtime) o, si no llega el aviso, al reabrir la
app.

**Testing de quien desarrolla (hecho por Claude):** `tsc --noEmit` limpio,
`npm test` (26 tests nuevos: `usuarios.test.ts` y stock en
`productos.test.ts`, incluidos valor exacto / uno arriba / uno abajo y
decimales), `expo export --platform web` compila, migración aplicada y
verificada por SQL, `get_advisors` sin hallazgos nuevos. **No hecho:** la
simulación SQL completa de permisos simulando cada usuario (bloqueada por permisos de la
sesión, queda pedida al equipo) y ninguna pantalla probada tocándola (las
sesiones de Claude no pueden loguearse con Google).

**Testing de QA:**
- Con una cuenta común, intentar `supabase.from('usuarios').update({ rol:
  'administrador' })` sobre la propia fila → tiene que fallar (era posible
  antes, ver incidentes-sprint9 #1).
- Admin: buscar por nombre/email, filtrar Administradores/Deshabilitados,
  deshabilitar a alguien (pide confirmación), volver a habilitarlo, hacer y
  quitar admin. Sobre la propia fila no aparece ninguna acción.
- Deshabilitado con la app abierta → ve "Cuenta deshabilitada"; al
  rehabilitarlo y reabrir, vuelve a ver sus hogares y productos intactos.
- Loguearse con una cuenta deshabilitada → solo "Cuenta deshabilitada".
- Usuario común: no ve el acceso "Usuarios" en Home.
- Stock: producto con mínimo 3 y cantidad 3 → sin alerta; 2 → "Stock bajo
  (mín. 3)"; 0 → "Sin stock"; 4 → sin alerta. Dos lotes (1 + 4) con mínimo 3
  → sin alerta (se mira el total). Producto sin mínimo y cantidad 0 → sin
  alerta.
- El ámbar de stock y el coral de vencimiento no se confunden en Home ni en
  la despensa.

**Regresión obligatoria:** Sprints 1 a 8 completos, con foco en login
(cuentas habilitadas siguen entrando normal), ABM de hogar e invitaciones
(los helpers de RLS cambiaron) y ABM de productos (los +/− y "Limpiar
agotados" no cambiaron de comportamiento).

---

## Notificaciones (Sprint 10)

Rama `feature/notificaciones` (PR apilado sobre el #15). Detalle en
[incidentes-sprint10.md](incidentes-sprint10.md). **Requiere** la migración
`20261012120000_notificaciones.sql` aplicada (**ya aplicada** el 2026-10-11, con `get_advisors` sin hallazgos nuevos) y un **development build nuevo**
(`expo-notifications` es nativo). El push con la app cerrada además requiere
Firebase configurado (pasos en incidentes-sprint10 #1); sin Firebase, los
vencimientos igual llegan por el plan B local.

**Ruta crítica:**
1. Cuenta A (dueño) y cuenta B. B manda el código → A ve el cartelito "Nueva
   solicitud", el numerito en la campanita y la notificación; tocarla abre
   "Miembros del hogar" de ese hogar.
2. A acepta → B ve "¡Te aceptaron!" con el nombre del hogar. Repetir
   rechazando y expulsando: B ve "Solicitud rechazada" / "Te sacaron de un
   hogar". B cancela su propia solicitud → A y B **no** reciben nada.
3. Producto con mínimo 3 y cantidad 4: restar a 2 → todos los miembros
   reciben "Stock bajo"; restar a 1 → **no** se repite; restar a 0 → "Sin
   stock". Tocarla abre la despensa con el filtro "Stock bajo".
4. Vencimientos: con días generales en 7, un producto que vence en 5 días
   → aparece en el Home y en la despensa con badge; cambiar el general a 3 →
   desaparece; ponerle a ese producto "10" en su formulario → vuelve a
   aparecer. Para la notificación sin esperar al job de las 9:00, correr
   `select public.generar_notificaciones_vencimiento();` (Claude puede
   hacerlo) y verificar que llega una sola vez aunque se corra dos veces.
5. Cartelitos: cualquier acción que antes mostraba "localhost dice..." (web)
   o el diálogo del sistema (celular) ahora muestra el cartelito de la app;
   eliminar un producto pide confirmación con el diálogo propio (botón
   coral).
6. Con la app **cerrada** (development build con Firebase): repetir 1 y 3 →
   llega la notificación del sistema; tocarla abre la campanita. Sin
   Firebase: solo llegan los avisos de vencimiento programados localmente.
7. Cerrar sesión con A y loguear B en el mismo celular → el celular deja de
   recibir push de A.

**Testing de quien desarrolla (hecho por Claude):** `tsc --noEmit` limpio,
`npm test` (al cierre del sprint: 20 suites / 403 tests, incluidos `notificaciones.test.ts`,
`notificacionesPush.test.ts`, cartelitos en `alert.test.ts`, días de aviso
en `productos.test.ts`, tareas previas al cierre de sesión en
`auth.test.ts`), la app compila para web y arranca sin errores de consola.
**No hecho:** tocar las pantallas logueado (no se puede loguear con Google
desde Claude), ni recibir un push real en un celular.

**Regresión obligatoria:** Sprints 1 a 9, con foco en: login/logout (se
agregó una tarea antes del `signOut`), aceptar/rechazar/expulsar (los avisos
de Home ahora vienen de la campanita), ABM de productos y +/− (trigger de
stock nuevo en `productos`), y vencimientos (la ventana ya no es fija en 7
días).

---

## Términos y Condiciones (Sprint 10)

Rama `feature/terminos-y-condiciones`. Requiere la migración
`20261013120000_terminos_aceptados.sql` aplicada.

**Ruta crítica:**
1. Sin sesión: Bienvenida → Onboarding → **Términos**. "Aceptar y continuar"
   está deshabilitado hasta tildar la casilla; al aceptar va al Login.
2. Login → entra directo a la app (no vuelve a pedir los términos) y en la
   base queda `terminos_version` y `terminos_aceptados_at` (Claude lo puede
   verificar por SQL).
3. Una cuenta que ya existía (sin `terminos_version`) → al abrir la app ve
   los términos con el aviso "Actualizamos los términos" y no puede usar la
   app hasta aceptarlos.
4. Home → enlace "Términos y Condiciones" → solo lectura, con flecha para
   volver.
5. Créditos al final: "Ver los 257 créditos de fotos" despliega la lista;
   tocar una foto abre su página de origen.

**Testing de quien desarrolla (hecho por Claude):** `tsc` limpio, tests de
`services/terminos.ts` y de `src/legal/` (incluido que cada foto del
`creditos.json` real tenga autor, licencia y enlace), y probado en el
navegador el paso 1 completo (incluida la pantalla a 375 px) y que la versión
aceptada queda guardada. **No hecho:** pasos 2 y 3 (requieren login con Google).

**Regresión obligatoria:** login y onboarding (Sprint 1) y la entrada a la app
de una cuenta deshabilitada (sigue viendo "Cuenta deshabilitada", no los
términos).

---

## Cuenta, modo oscuro, varias cuentas y edición del ticket (Sprint 10)

Rama `feature/cuenta-y-ajustes`. Sin migraciones. Detalle en
[incidentes-sprint10.md](incidentes-sprint10.md).

**Ruta crítica:**
1. Botón de la persona → Cuenta: muestra nombre, email y (si corresponde)
   "Administrador". Editar el nombre → se ve en Home y en "Miembros del
   hogar". Nombre vacío → aviso, no se guarda.
2. Apariencia: sin haber elegido nada, la app sigue el modo del celular
   ("Sistema"): con el teléfono en oscuro se ve oscura, y cambia sola al
   cambiar el teléfono (requiere el build nuevo, por `userInterfaceStyle`).
   Oscuro → TODA la app pasa a oscuro (recorrer Home,
   despensa, formularios, modales, campanita, cartelitos, términos);
   Claro → vuelve; Sistema → sigue al modo del celular. Cerrar y abrir la
   app → recuerda la elección.
3. Varias cuentas: "Agregar otra cuenta" → Google pregunta qué cuenta → entra
   con la nueva y la anterior aparece en "Tus cuentas". Tocar la otra → cambia
   sin pasar por el login, con sus hogares y productos (nada mezclado).
4. Cerrar sesión con dos cuentas → pasa a la otra; con una sola → vuelve a la
   bienvenida. La sesión en la web u otro celular de esa persona **sigue
   abierta** (antes se cerraba en todos lados). "Cerrar sesión en todas"
   → bienvenida y la lista vacía.
5. Escanear un ticket → en la revisión: "Cambiar producto" elige otro del
   catálogo (conserva cantidad/marca/fecha); "Escribir a mano" deja editar
   el nombre; cargar un vencimiento; borrar el nombre o poner cantidad 0 →
   aviso debajo y botón deshabilitado. Al confirmar, los productos se
   guardan con lo corregido (incluida la fecha).

**Testing de quien desarrolla (hecho por Claude):** `tsc` limpio, `npm test`
(22 suites / 439 tests: `cuentas.test.ts`, `tema.test.ts`, corrección del
ticket en `escaneo.test.ts`, cierre de sesión y elección de cuenta en
`auth.test.ts`, nombre propio en `usuarios.test.ts`), y el modo oscuro
probado en el navegador en las pantallas sin login. **No hecho:** los pasos
1, 3, 4 y 5 (requieren login con Google).

**Regresión obligatoria:** login/logout (cambió `signOut`), notificaciones
(el push sigue a la cuenta activa), y una pasada visual por todas las
pantallas en modo claro (se tocaron los estilos de las 25).

---

## Sprint 9 — Roles completos, mejoras UI/UX (RF0 completo, RF9 completo)

**Ruta crítica:**
1. Cada pantalla restringida a admin es inaccesible para un usuario
   normal (probar TODAS las pantallas de admin que existan a esta
   altura, no solo la de usuarios).
2. Cambios de UI/UX no rompen ningún flujo de los sprints 1-8.

**Nota:** en el brief original no quedó explícito en qué sprint entra
RF10 (métricas de admin: hogares activos, productos cargados). Si
todavía no se asignó a ningún sprint, vale la pena que Facundo lo
confirme ahora — si es sprint 9, hay que agregarle su propia ruta
crítica acá.

**Testing de QA:** este sprint es, en la práctica, **una regresión
general de todo el proyecto** — es el que más se parece a lo que
preguntabas de "testeo en masa". Recomiendo correr la ruta crítica de
cada sprint anterior, una por una, en orden.

---

## Sprint 10 — Corrección de bugs, documentación, deploy

No hay funcionalidad nueva. La "ruta crítica" es la checklist completa
de **todos** los sprints anteriores, ejecutada de punta a punta como si
fuera un usuario nuevo instalando la app por primera vez. Este es el
sprint donde más tiene sentido pedirme una pasada general (ver abajo).

---

## Qué testeo general puedo hacer yo (Claude) hoy

Con las herramientas que tengo ahora, en cualquier momento me podés
pedir una "pasada general" y voy a poder cubrir esto de forma
confiable:

1. **Estático**: `tsc --noEmit`, `expo-doctor`, lint — detecta roturas
   de tipos/config al instante, sin depender de un dispositivo.
2. **Base de datos**: correr `get_advisors` (seguridad y performance)
   después de cualquier migración nueva, y queries de verificación
   (ej: "el usuario X, ¿puede ver productos del hogar Y al que no
   pertenece?" simulando la policy).
3. **Web**: navegar yo mismo con el preview del navegador todas las
   pantallas que no requieran login real (o que ya tengan una sesión
   activa), revisando errores de consola y que el contenido/flujo sea
   el esperado.
4. **Regresión dirigida**: si me decís "agregamos el OCR, fijate si el
   alta manual se rompió", puedo leer el código de ambos flujos y
   avisar si comparten una función que cambió de forma incompatible —
   esto es más "revisión de código" que "testing", pero pesca varios
   de los bugs que preocupan en el ejemplo que diste.

**Lo que NO puedo hacer solo** (necesita que alguien del equipo lo
dispare):
- Tocar la pantalla de un celular real, sacar una foto con la cámara,
  grabar audio, o elegir una cuenta de Google.
- Confirmar que la app "se siente bien" en un dispositivo real (fluidez,
  vibración, permisos del sistema operativo).

**Actualización:** ya está armado Jest (`npm test`, ver
[README](../README.md#tests)), con tests de la lógica pura que existía
hasta ahora (login de Google, wrappers de OCR/voz, theme). Eso sí puedo
correrlo yo con un solo comando cada vez que se agrega o toca algo. Lo
que todavía falta para un "testeo en masa" completo de pantallas reales
en el celular es algo tipo Maestro/Detox (e2e) — eso sigue pendiente,
recomendado recién más adelante (Sprint 6-7) según lo charlado.
