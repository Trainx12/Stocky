# Incidentes y soluciones — Sprint 8

Registro de los problemas encontrados y de los cambios hechos en el Sprint 8
(voz con Gemini, lotes agrupados, sugerir productos con foto, fotos del
catálogo), todo dentro del PR #13 (`feature/escanear-ticket-vencimiento`).
Mismo espíritu que [incidentes-sprint1.md](incidentes-sprint1.md) a
[incidentes-sprint4.md](incidentes-sprint4.md): que si un error parecido
vuelve a aparecer, no haya que redescubrirlo de cero. Incluye los errores
propios cometidos durante el desarrollo (sección "Errores de proceso"), no
solo los del producto.

Resumen de lo que entró en este sprint (detalle técnico en
[arquitectura-del-codigo.md](arquitectura-del-codigo.md)):

| Cambio | Dónde |
|---|---|
| ABM de productos por voz (alta, baja, cambio de cantidad y de vencimiento) | `ComandoVozModal`, `services/voz.ts`, `lib/grabacion.ts`, Edge Function `voz-a-texto` |
| Dictar solo la fecha de vencimiento en el formulario | `ProductoFormModal` (micrófono junto a la cámara) |
| Llamada a Gemini compartida, con respaldo en paralelo | `supabase/functions/_shared/gemini.ts` |
| Lotes del mismo producto agrupados en una tarjeta | `ProductosScreen`, `agruparProductos` / `ordenarLotes` |
| Lupa de la barra de abajo abre el buscador de la despensa | `HomeScreen`, `ProductosScreen` (`enfocarBusqueda`) |
| "Sugerir producto" visible + foto opcional | `CatalogoSelectorModal`, `HomeScreen`, `services/catalogo.ts`, bucket `catalogo-sugerencias` |
| Fotos para todo el catálogo (257/257) | `assets/catalogo`, `creditos.json`, `CREDITOS.md` |
| "Radicheta" pasa a llamarse "Achicoria" | migración `20260915120000_radicheta_a_achicoria.sql` |

Migraciones nuevas (las dos **ya aplicadas** en el proyecto de Supabase):
`20260915120000_radicheta_a_achicoria.sql` y
`20260916120000_fotos_sugerencias.sql`. Edge Functions desplegadas:
`voz-a-texto` (nueva) y `vencimiento-foto` (pasa a usar `_shared/gemini.ts`).

---

## 1. Gemini tardaba ~20 s en responder (voz y foto de vencimiento)

**Síntoma:** la primera versión de `voz-a-texto` respondía bien pero tardaba
18-22 s por pedido, y la foto del envase (`vencimiento-foto`) ~18 s.

**Investigación:** se agregó un log del modelo que respondió y su demora
(`[voz-a-texto] gemini-3.5-flash respondió en 1369 ms`) y se midió cada
modelo con el mismo audio:

| Modelo | Comportamiento medido |
|---|---|
| `gemini-3.8-flash` (era el primero) | 503 "high demand" o más de 15 s |
| `gemini-3.5-flash` | 1-2 s cuando no está saturado; a veces más de 15 s |
| `gemini-3.5-flash-lite` | 3-10 s, pero **perdió un dato**: con "agregá dos leches" devolvió cantidad vacía |

La causa de la demora no era solo el orden: el respaldo era **secuencial**,
así que con un modelo trabado se esperaban los 15 s de timeout completos
antes de probar el siguiente.

**Solución** (`_shared/gemini.ts`):
- Orden nuevo: `3.5-flash` → `3.5-flash-lite` → `3.8-flash`.
- Si un modelo no contestó en 5 s, se consulta **en paralelo** al siguiente
  y gana el primero que responda; los pedidos que quedan en vuelo se cancelan.
- Un 503/429/404/500 pasa al siguiente sin esperar los 5 s; un error real
  (key inválida, audio inválido) corta sin probar más modelos.

Resultado medido: voz 2-4 s y foto de vencimiento ~2 s (antes 18-22 s), y
"dos leches" volvió a dar cantidad 2.

**Costo a tener en cuenta:** cuando el primer modelo tarda más de 5 s, ese
pedido consume cuota de dos modelos. En el free tier (pocas requests por
día) conviene mirar los logs si aparecen 429.

**Tests:** `src/services/geminiRespaldo.test.ts` (11 casos: primero rápido,
respaldo en paralelo, el primero gana igual, 503 inmediato, 404/429 al
siguiente, respuesta sin contenido, error real que corta, todos saturados,
reintento sin "thinking" ante un 400, secret `GEMINI_MODEL` y key en el
header `x-goog-api-key`, nunca en la URL).

---

## 2. Cargar el mismo producto con otra fecha dejaba filas sueltas por toda la lista

**Síntoma (reportado por el equipo):** al cargar por voz "3 manzanas que
vencen en 2 días" y después "3 manzanas" con otra fecha, quedaban dos filas
independientes. Correcto para distinguirlas, pero con muchos productos la
lista se vuelve inmanejable.

**Decisión:** **no** se juntan en la base. Cada fila sigue siendo un lote con
su marca, cantidad y vencimiento (si se fusionaran se perdería qué fecha
corresponde a qué unidades, y la alerta "Vence en 2 días" dejaría de ser
exacta). Lo que cambia es **cómo se muestran**: `agruparProductos` junta por
nombre (sin distinguir mayúsculas/tildes) y unidad, y cada producto es una
tarjeta con el total arriba y los lotes adentro, ordenados por
vencimiento (`ordenarLotes`).

No se agrupa el mismo producto en unidades distintas (papa en kg y en
paquetes): sumarlas daría un total sin sentido.

Iteraciones de diseño pedidas por el equipo (quedan anotadas para no
repetirlas): negrita en el nombre → descartada ("queda feo"); borde solo en
el encabezado → "más remarcado"; tarjeta completa con franja violeta
(boceto del equipo) → aprobada; tarjeta para **todos** los productos, aunque
tengan un solo lote, para que la lista sea homogénea.

---

## 3. Los renglones de los lotes no entraban en pantallas angostas

**Síntoma (captura del equipo):** en el celular, "3 kg · vence 07/10/2026" y
la etiqueta "Vence en 2 días" se partían en varias líneas.

**Causa:** los botones +/− tenían un `marginLeft` de 24 px heredado de la
fila anterior, más íconos de 30 px y un `gap` de 16 px entre editar y
eliminar: al texto le quedaban ~100 px.

**Solución:** se sacó el margen, íconos de 26/16 px, textos del lote a 14/12
px y la etiqueta de vencimiento en una sola línea (`numberOfLines={1}`).
Quedan ~180 px para el texto, que ocupa ~150 px a 360 px de ancho. **No se
verificó en un celular real** (ver sección "Lo que no se pudo verificar").

---

## 4. Nadie encontraba cómo sugerir un producto

**Síntoma:** "no encontré el botón". En la base no había **ninguna**
sugerencia hecha por un usuario (`sugerido_por` siempre nulo).

**Investigación:** la RLS permitía sugerir (se probó con un insert simulado
como usuario común, revertido) y el formulario existía. El problema era de
visibilidad: el botón solo aparecía dentro de "Agregar producto" → "Elegí un
producto", **y solo después de escribir algo en el buscador**.

**Solución:** pie fijo "¿No encontrás tu producto? Sugerilo" en el selector
del catálogo (siempre visible) y acceso rápido "Sugerir producto" en el Home
que abre el formulario directo (`soloSugerir`).

**Lección:** antes de dar una funcionalidad por terminada, probar el camino
de un usuario que no sabe dónde está; una feature escondida equivale a una
que no existe.

---

## 5. Foto al sugerir un producto: permisos de Storage

Bucket público `catalogo-sugerencias` (máx. 1 MB, solo JPEG), cada usuario
sube a su carpeta `<auth.uid()>/`. Se cambió además la policy de insert de
`productos_catalogo`: una sugerencia solo puede traer `imagen_url` de **su
propia carpeta** de ese bucket (sin esto, cualquiera podía poner un enlace a
un sitio externo en el catálogo).

Verificado por SQL simulando un usuario común (en transacciones revertidas):
foto propia → OK; enlace externo → rechazado; carpeta de otro usuario →
rechazado; sin foto → OK; subir a su carpeta en Storage → OK; a otra →
rechazado.

Al rechazar una sugerencia, el admin borra también su foto; al aprobarla,
la foto queda como la del producto en el catálogo (la app ya usaba
`imagen_url` como respaldo de las fotos locales). Si la foto se sube pero
falla el alta de la sugerencia, se borra para no dejarla huérfana.

---

## 6. Fotos del catálogo: búsquedas automáticas poco confiables

Faltaban fotos para 86 de 257 productos. Se buscaron en Wikimedia Commons
(solo licencias CC0, dominio público, CC BY y CC BY-SA) y Open Food Facts.

Problemas encontrados:
- **La búsqueda automática trae fotos que no corresponden**: "Agua Tónica"
  devolvía fotos de laboratorio con luz ultravioleta, "Vino Blanco" vino
  tinto, "Jengibre" un recital, "Spaghetti" maquinaria. Por eso cada foto se
  eligió a ojo entre 3 candidatas, con hasta 4 rondas de búsqueda, y al
  final se revisaron las 84 guardadas una por una.
- **Wikimedia limita los pedidos (HTTP 429)** si se le piden muchas
  miniaturas seguidas, y **Open Food Facts devolvió 503** en el primer
  intento. Se espació la búsqueda y se cortó cuando Commons siguió
  limitando, en vez de insistir.
- Leche de Coco y Radicheta no tenían ninguna foto usable; las aportó el
  equipo después (ver #7).

Fotos aproximadas que conviene reemplazar si aparece una mejor: Coco
Rallado (coco partido), Premezcla para Pizza (una pizza), Provenzal
(perejil y ajo con tomates), Sal Gruesa (sal rosada).

---

## 7. "Radicheta" pasa a llamarse "Achicoria" + fotos aportadas por el equipo

Migración `20260915120000_radicheta_a_achicoria.sql`: renombra el producto
del catálogo y también los productos de hogares que lo usen (al aplicarla no
había ninguno). La foto se recortó del sobre de semillas para dejar solo las
hojas (sin el texto "Radicheta" ni el logo).

**Pendiente:** un ticket o un comando de voz que diga "radicheta" ya no
encuentra el producto en el catálogo (el matching es por nombre). Si los
tickets lo traen así, habría que agregar sinónimos.

**Licencias a confirmar:** las fotos de Achicoria y Leche de Coco figuran
como "Aportada por el equipo — a confirmar". La de Leche de Coco parece una
imagen publicitaria de La Serenísima: revisarlo al armar los términos y
condiciones.

---

## 8. Jest corría también los tests de una copia vieja del repo

**Síntoma:** en la salida de `npm test` aparecían suites repetidas con ruta
`.claude/worktrees/loving-sanderson-8bf91a/src/...`.

**Causa:** Claude Code crea copias del repo en `.claude/worktrees/` y Jest,
sin configuración, busca tests en todas las carpetas.

**Solución:** `testPathIgnorePatterns` en `package.json` excluye
`<rootDir>/.claude/`.

---

## 9. Gemini a veces devolvía incompleta la interpretación de la voz

**Síntoma (encontrado al re-probar antes de cerrar el sprint):** con el
mismo audio que el 5/10 se interpretaba bien ("agregá dos leches La
Serenísima que vencen el 15 de noviembre, usé tres huevos y eliminá el
yogur"), la transcripción seguía perfecta pero la interpretación salía
incompleta: la fecha de la leche llegaba en `null` en 3 de 3 corridas y
"usé tres huevos" llegaba **sin** `operacion_cantidad` en 2 de 3. Sin la
operación, la app dejaba los huevos como estaban: el usuario lo vería en la
revisión, pero tendría que corregirlo a mano.

**Causa:** variabilidad del modelo. En el esquema de respuesta solo
`accion` y `nombre` eran obligatorios; el resto eran opcionales y el modelo
tendía a omitirlos (o dejarlos en `null`) aunque se hubieran dicho.

**Solución:**
- `voz-a-texto`: todos los campos de cada acción pasan a `required` (pueden
  seguir siendo `null`), con `propertyOrdering`; el prompt pide revisar que
  una fecha dicha nunca quede en `null` y que una modificación con cantidad
  siempre tenga operación, y trae un ejemplo completo de respuesta.
- `services/voz.ts` (red de seguridad): si una modificación trae cantidad
  pero no operación, no se adivina: la cantidad queda como estaba y se
  muestra el aviso "No quedó claro qué hacer con 3: poné la cantidad final a
  mano".

**Verificación:** 4 de 4 corridas correctas, incluida una frase **distinta**
a la del ejemplo del prompt ("compré medio kilo de queso cremoso que vence
el tres de diciembre, me tomé dos yogures y quedan cinco huevos" → alta 0,5
kg con fecha, restar 2, fijar 5), para no medir con la misma frase que el
modelo tiene de ejemplo.

**Lección:** las respuestas de un modelo no son deterministas: una prueba
que pasó una vez no garantiza que siga pasando. Para QA, repetir cada frase
de prueba varias veces y con variantes.

---

## Errores de proceso (cometidos durante el desarrollo)

Errores propios que no llegaron al producto pero costaron tiempo; se anotan
para no repetirlos.

1. **Despliegue de `vencimiento-foto` rechazado** ("import map path does not
   exist"): al redesplegar una función que ya existía, la MCP de Supabase
   reutilizaba la ruta absoluta del import map anterior. Solución: pasar
   `import_map_path: "deno.json"` explícito en cada despliegue.
2. **Error de tipos en Deno** al agregar el respaldo en paralelo:
   `setTimeout` devuelve `Timeout`, no `number`. Se usa
   `ReturnType<typeof setTimeout>`. Se detectó con `deno check` antes de
   desplegar (correrlo siempre: el despliegue no valida tipos).
3. **Mock de Storage en Jest evaluado antes de definirse:** Jest sube los
   `jest.mock(...)` al principio del archivo, así que una referencia directa
   a `mockStorageFrom` dentro de la factory era `undefined`. Se envolvió en
   una función (`(bucket) => mockStorageFrom(bucket)`), como el resto de los
   mocks del archivo.
4. **Elegir el lote "que vence primero" con `agruparProductos`** fallaba
   cuando los lotes tenían unidades distintas (quedaban en grupos separados
   y se tomaba el grupo equivocado). Lo detectó un test; se reemplazó por
   `ordenarLotes` sobre la lista completa.
5. **Simulación de `fetch` incorrecta en un test:** contaba como "cancelado"
   a un pedido que ya había respondido (un `fetch` real ignora el abort en
   ese caso). El error estaba en el test, no en el código.
6. **Diff innecesario en `creditos.json`:** al regenerarlo se cambió la
   sangría y el orden, y el diff mostraba ~3000 líneas para 84 entradas
   nuevas. Se rehízo conservando el formato original (solo agrega líneas).
7. **Una vista previa HTML quedó un rato dentro de `.claude/`** del repo; se
   movió a la carpeta temporal antes de commitear.
8. **Sesiones de Claude trabajando en paralelo sobre la misma carpeta:** al
   cerrar este sprint había otra sesión ("Evaluación de API OCR") editando
   archivos de la misma rama. Se commitearon solo los archivos propios y se
   le avisó para coordinar. Para el futuro: una sesión por carpeta, o usar
   worktrees separados.

---

## Lo que no se pudo verificar (para QA)

La app web pide iniciar sesión con Google y las sesiones de desarrollo no
pueden loguearse, así que **ninguna pantalla nueva se probó tocándola en la
app**. Se verificó con: `tsc`, los tests de Jest, `expo export --platform
web` (compila), llamadas reales a las Edge Functions con audio e imágenes de
prueba, y simulaciones SQL de los permisos. Hay que probar a mano:

- Grabar por voz en Android, iOS y web (permiso de micrófono incluido).
  `expo-audio` y `expo-file-system` son módulos nativos nuevos: **hace falta
  un build nuevo del dev client** (`eas build`).
- Tarjetas de lotes a 360 px de ancho (que nada se parta en dos líneas).
- La lupa de la barra de abajo abre el teclado en el buscador.
- Sugerir con foto (cámara y galería), verla como admin, aprobar y rechazar.
