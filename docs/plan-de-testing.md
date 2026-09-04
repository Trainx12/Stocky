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
- Probar el flujo completo al menos una vez en Expo Go/dev client real,
  no solo en web.
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
  OCR (ej: "reconoce nombre y cantidad en al menos el 70% de tickets de
  supermercado estándar") — esto lo arma el equipo, no es un test
  automatizable.
- QA debería juntar un set de ~10-15 fotos de tickets reales (variados:
  arrugados, con mala luz, distintos supermercados) para usar como caso
  de prueba en el Sprint 6, no esperar a tenerlas recién ahí.

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
