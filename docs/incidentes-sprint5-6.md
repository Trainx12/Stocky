# Incidentes y soluciones — Sprints 5 y 6 (OCR, foto de vencimiento y catálogo)

Registro de **todos los errores** que aparecieron mientras se integraba el OCR de
tickets (OCR.space), la lectura de la fecha de vencimiento por foto (Gemini),
las marcas y el catálogo con fotos. Incluye los errores propios de la
implementación (marcados como *error de implementación*) y los que vinieron de
servicios externos, para que si algo parecido vuelve a pasar no haya que
redescubrirlo. Mismo espíritu que
[incidentes-sprint1.md](incidentes-sprint1.md),
[incidentes-sprint2.md](incidentes-sprint2.md),
[incidentes-sprint3.md](incidentes-sprint3.md) y
[incidentes-sprint4.md](incidentes-sprint4.md). Para el detalle de qué se
construyó ver [cambios-sprint5-6.md](cambios-sprint5-6.md).

Cada incidente tiene **Síntoma / Causa / Solución / Lección**.

---

## A. Edge Functions y proveedores externos

### 1. `ocr-ticket` apuntaba al endpoint PRO de OCR.space — *error de implementación*

**Síntoma:** ninguno todavía (se detectó al revisar el código antes de la primera
prueba real); habría fallado con una key gratuita.

**Causa:** la primera versión llamaba a `https://apipro1.ocr.space/parse/image`.
Los endpoints `apipro1/apipro2` son solo para planes PRO; la key gratuita
(`K8...`) va contra `https://api.ocr.space/parse/image`.

**Solución:** endpoint gratuito, redeploy (v2).

**Lección:** verificar el endpoint contra el plan de la key antes de deployar.

### 2. Las Edge Functions nunca habían estado deployadas — *hallazgo*

**Síntoma:** `list_edge_functions` devolvía `[]` aunque el repo tenía los stubs.

**Causa:** los archivos de `supabase/functions/` eran stubs de repositorio; nadie
los había subido al proyecto de Supabase.

**Solución:** primer deploy de `ocr-ticket` y `vencimiento-foto` (con `verify_jwt: true`,
el cliente ya manda el JWT de la sesión).

### 3. Redeploy fallaba con "import map path does not exist" — *error de implementación*

**Síntoma:** al redeployar una función ya existente, el deploy devolvía
`BadRequestException: import map path does not exist`.

**Causa:** la versión nueva heredaba la ruta del `deno.json` de la versión
anterior (una ruta temporal que ya no existe).

**Solución:** pasar siempre `import_map_path: "deno.json"` al redeployar, e
incluir `deno.json` y los módulos de `_shared/` en los `files`.

### 4. "Edge Function returned a non-2xx status code" tapaba el error real

**Síntoma:** en la app, cualquier fallo de una función mostraba el mensaje
genérico `Edge Function returned a non-2xx status code`, sin dar pista de qué
pasó (apareció con la foto del vencimiento).

**Causa:** `supabase-js` reemplaza cualquier respuesta no-2xx por ese mensaje y
deja el body real en `error.context` (un `Response`).

**Solución:** `lanzarErrorDeFuncion()` en `src/services/externalApis.ts` lee el
`error` del body y lo muestra; si no se puede leer, relanza el original (tests en
`externalApis.test.ts`). En el servidor, el detalle técnico queda en los logs de
la función y al usuario le llega un mensaje entendible.

**Lección:** ante un 502 genérico, mirar primero los logs de la función
(`function_logs` / `function_edge_logs`) antes de suponer una causa.

### 5. Gemini devolvía 404: modelo retirado — *suposición equivocada*

**Síntoma:** la foto del vencimiento fallaba siempre. La primera hipótesis fue
"se acabó la cuota gratuita", y era falsa.

**Causa:** los logs mostraron `404 NOT_FOUND: models/gemini-2.5-flash is no longer
available to new users`. Google retira modelos Flash para cuentas nuevas sin
aviso. (Además la key tenía formato `AQ.…`, que no se había probado en la URL.)

**Solución:** modelo configurable con el secret `GEMINI_MODEL` (lista separada
por comas) y lista de respaldo; la key pasó al header `x-goog-api-key` (así no
queda en ningún log). Los límites del free tier se midieron en AI Studio:
5 RPM, ~250K TPM, 20 RPD (idénticos para 2.5 y 3.8).

**Lección:** no asumir la causa; los logs dicen el código exacto. Documentar el
modelo vigente y que Google los rota.

### 6. Gemini 503 ("high demand") y respuestas de hasta 89 s

**Síntoma:** la foto "funciona pero tarda muchísimo"; una prueba tardó 89 s.

**Causa (dos, acumuladas):** (a) `gemini-3.8-flash` respondía 503 y cada 503 tarda
~6 s en llegar, y el código reintentaba dos veces el mismo modelo; (b) el modelo de
respaldo usaba el nivel de razonamiento por defecto ("medium") y tardaba ~80 s para
leer una fecha.

**Solución:** `thinkingLevel: minimal` (si el modelo lo rechaza con 400, se reintenta
sin él), timeout por intento, pasar directo al siguiente modelo ante 503/429/404/500
sin reintentar el mismo. La sesión del Sprint 8 lo refinó en
`supabase/functions/_shared/gemini.ts`: a los 5 s sin respuesta se consulta en
paralelo al siguiente modelo, gana el primero que responde y se cancela el resto
(tests en `geminiRespaldo.test.ts`). El orden por defecto se eligió midiendo logs.

**Lección:** los tiempos de Gemini varían mucho entre pedidos del mismo modelo; no
fijar un único modelo ni esperar el timeout completo antes del respaldo.

### 7. Límites de ritmo al bajar fotos de catálogo (503 y 429)

**Síntoma:** Open Food Facts respondía `503 Service Temporarily Unavailable` y
Wikimedia Commons `429 Too Many Requests` al buscar y descargar candidatos.

**Causa:** pedidos en paralelo (4 hilos, y luego dos procesos a la vez) y miniaturas
de 400 px, un tamaño no estándar que Wikimedia limita más (pide los tamaños de su
lista, p. ej. 500).

**Solución:** un solo proceso en serie, espera exponencial ante 429/503, pausa entre
descargas y miniaturas de 500 px.

---

## B. Fotos en la app (cámara, galería, HEIC)

### 8. Las fotos HEIC no se podían usar en la versión web — *dos intentos*

**Síntoma:** al elegir `IMG_4887.HEIC` (foto de iPhone) para el vencimiento, la app
fallaba. Mi primer arreglo (convertir con `heic2any` antes de achicar) **no
funcionó** y se reportó "sigue sin dejarme".

**Causa:** `expo-image-picker` en web carga la imagen en un `<img>` para medirla
*antes* de devolverla, y los navegadores de escritorio no abren HEIC: la librería
fallaba por dentro, antes de que mi conversión llegara a ejecutarse. El primer
arreglo se dio por bueno sin reproducirlo (*error de implementación*). Se reprodujo
recién en el navegador integrado con la foto real: `HEIC directo en <img>: NO abre`;
convertida, 3024×4032 → 1400 px → 198 KB.

**Solución:** en web, selector de archivo propio (`<input type=file>`, con
`capture` para la cámara), conversión a JPEG con `heic2any` (carga diferida) y
recién entonces el achicado (`src/lib/fotos.ts`, `esHeic` con tests).

**Lección:** reproducir con el archivo real antes de dar un arreglo por cerrado.

### 9. Las fotos grandes superaban el límite de OCR.space

**Causa conocida desde el diseño:** OCR.space gratis rechaza archivos de más de 1 MB.
**Solución:** toda foto se achica a 1400 px y se recomprime a JPEG (calidad 0.6) antes
de enviarse; así también llega siempre con el mismo MIME a las funciones.

---

## C. Parser de tickets (`supabase/functions/_shared/ticket.ts`)

Cada ticket real probado reveló un formato distinto. Se documentan todos porque el
parser es heurístico y son los casos que hay que mirar si falla otro.

### 10. El parser devolvía "no se detectaron productos" en tickets reales

| # | Ticket | Síntoma | Causa | Solución |
|---|---|---|---|---|
| a | La Genovesa (supermercado) | Encabezado fiscal, CUIT, dirección y pie salían como productos | Se trataba cada línea con letras como producto | Aislar el cuerpo entre las líneas de datos de la compra (Caja/Fecha/Hora) y el primer Subtotal/Total; ignorar CUIT, direcciones, "Anula producto" |
| b | La Genovesa, otra prueba | "No reconocí productos" | El OCR deja nombre, IVA y precio en líneas separadas y el parser exigía precio en la misma línea | Con el cuerpo ya aislado, una línea con letras es un producto aunque no traiga precio |
| c | Restaurante (CANT / DESCRIPCION / PRECIO) | Solo salió "El Importe Total…" | Sin marcadores Caja/Fecha, no había zona; y "El Importe Total" no cerraba el ticket | `CANT/DESCRIPCION` marca el inicio, `El importe` el fin; columna CANT al inicio ("1.0 MILANESA") como cantidad; el OCR lee `1.J` por `1.0` |
| d | Super Mora (Costa Rica) | Solo salían "ITBIS/Unitario/Descripción" | El OCR separa las columnas y un **"Total" suelto** del encabezado se tomaba como fin del ticket, cortando antes de los productos | Un "Total" sin cifra solo cierra el cuerpo si ya hubo productos; precios con letra pegada (`844.75m`) y en pares unitario/total; cantidades con 3 decimales (`0.775 CEBOLLA`); ignorar "Ahorro Espec…", códigos de terminal (`MXL31604CT`), "Tiquete electrónico en contingencia" |
| e | Bravo (República Dominicana) | Solo salían títulos de columnas y "CARNES ROJAS" | **Subtotal por sección** (debajo de cada título) cerraba el ticket; encabezado leído "DESCHIPCION"; código de impuesto separado (`277.44 E`, `134.00 I2`); la cantidad podía ir *después* del nombre (`BRAVO CANELA SOBRE` / `4 x 49.00`) | Un Subtotal pegado a un título de sección no cierra; títulos de sección no son productos; patrón tolerante para "descripción"; una cantidad seguida solo de precios es del producto anterior |
| f | Mines Cesar | Salían el nombre del local, la dirección y el rótulo "Bebidas" | Nada de eso tiene forma de producto en una lista | Ignorar direcciones con prefijo de calle (`AV./AY.`), rótulos de sección (Bebidas, Almacén…) |

**Red de seguridad (decisión de diseño):** como cada local imprime distinto, lo
que no coincide con el catálogo arranca **sin incluir** en la pantalla de revisión
("Agregar igual"): una línea mal leída nunca se guarda por descuido. El criterio
de aceptación del Sprint 5 (≥70 % de tickets con al menos un producto
reconocido) **no se midió formalmente**: se probó con ~6 tickets reales.

**Limitaciones conocidas:** foto chica y tinta desvaída (ticket de ~400 px) no se lee
bien con OCR.space; la mejora prevista es recorte de la foto y Gemini como respaldo
para tickets difíciles (sin hacer). Con el free tier de Gemini (20 pedidos/día en
total) hay que usarlo solo como respaldo.

### 11. Caracteres de control en las expresiones regulares — *error de implementación*

**Síntoma:** un test del parser fallaba aunque el código "se veía bien".

**Causa:** al reescribir archivos con scripts de Python y *heredocs* de shell, un
`\b` dentro de un string normal de Python se convirtió en un **carácter de control
(backspace)** dentro de la regex `INICIO_DE_COMPRA`; en otros casos `\n` se grabó
como un salto de línea real y rompió `ticketParser.test.ts` y
`scripts/generar-imagenes-catalogo.mjs` (`SyntaxError: Invalid or unexpected token`).
Los *heredocs* con apóstrofes también fallaban al parsearse.

**Solución:** corregir las expresiones y, desde ahí, editar archivos con las
herramientas de edición directa (no con reemplazos de texto generados desde
Python con barras invertidas).

**Lección:** ante un test que falla sin explicación en una regex, buscar caracteres
de control invisibles.

---

## D. Marcas, catálogo y matching

### 12. El RPC de ajuste de cantidad solo aceptaba enteros — *error de diseño original*

**Síntoma:** no se podía sumar 0,5 l a 3 l de agua al unir duplicados.

**Causa:** `ajustar_cantidad_producto(p_delta int)` (alcanzaba para el +1/−1) mientras
`productos.cantidad` es `numeric`.

**Solución:** migración `20260912120000_productos_marca.sql` borra la función con `int`
y la recrea con `numeric`; los campos de cantidad usan teclado decimal. Compatible
con el cliente anterior (un `1` JSON también resuelve a numeric).

### 13. El matching tolerante podía confundir productos de nombre parecido

**Causa:** la tolerancia a errores de OCR (distancia de edición ≤ 1 en palabras de
5+ letras) hace que "Pimienta" ≈ "Pimiento".

**Solución:** renombrar a `Pimienta Negra` y `Pimiento`, y tests de regresión
(`escaneo.test.ts`). **Limitaciones aceptadas:** "LA SERENISIMA" sugiere la marca
"Serenisima" (se descarta la palabra vacía "la"); "GASEOSA COLA SIN AZUCAR" puede
sugerir "Gaseosa Sin Azúcar". Siempre editable en la revisión.

### 14. Nombres que no estaban en el catálogo y productos que se pidió quitar

Los ítems vistos en tickets reales y no cargados (flan, leche en polvo, pasta para
sopa, porotos…) se agregaron (96 + 87 alimentos). Por pedido del equipo se
quitaron `Crema de Leche Larga Vida` y `Cuscús` (migraciones
`20260914130000_quitar_crema_larga_vida.sql` y `20260914140000_quitar_cuscus.sql`,
que solo borran si ningún hogar los usa). Se respeta lo ya decidido: **sin carnes,
fiambres, congelados, pescado enlatado ni productos que no sean comida**.

---

## E. Fotos del catálogo

### 15. Dependencia de Open Food Facts

**Síntoma/riesgo:** 64 productos apuntaban a URLs de `images.openfoodfacts.org`; si el
sitio cae (estuvo con 503 durante la sesión) se caen todas las fotos.

**Solución:** las fotos viven en el repositorio (`assets/catalogo/`, 300 px, cuadradas
con fondo blanco, ~4,2 MB las 257) y la app usa primero la foto local (`imagenDeCatalogo`);
la URL de la base queda solo como respaldo para productos aprobados después.

### 16. Las fotos se veían recortadas ("demasiado zoom") — *error de implementación*

**Síntoma:** la botella de "Aceite de Girasol" se veía como un fragmento amarillo.

**Causa:** `resizeMode="cover"` sobre una casilla cuadrada de 56 px recorta cualquier
imagen que no sea cuadrada (botellas, paquetes).

**Solución:** `resizeMode="contain"` en una casilla blanca de 64 px y todas las fotos
pasadas a cuadradas con fondo blanco (el producto se ve entero).

### 17. Fotos equivocadas o con marca (auditoría de las 171 fotos)

**Síntoma:** al revisar el catálogo a ojo aparecieron fotos que no eran el producto o
mostraban envases de marca.

**Errores concretos de la tanda original de Open Food Facts:** *Limón* mostraba un
logo ("Tana"), *Papa* una lata de snack, *Pepino* una etiqueta de código de barras,
*Manzana* un sachet de puré, *Zanahoria* una ensalada envasada, *Uva* una bandeja
con etiqueta, *Medialunas* el texto de un envase, *Ajo* un frasco de especia, *Cebolla*
una bolsa en red y *Tomate* una lata. En la primera selección de fotos nuevas
(*error de implementación*) se eligieron envases con marca porque todavía no estaba
el criterio "solo el producto, sin marca, entero".

**Solución parcial:** se reemplazaron esas 17 frutas/verduras/pan por fotos genéricas de
Wikimedia Commons revisadas a ojo (fruta o verdura entera, sin envase) y se
reemplazó la foto de Café (Arlistán es instantáneo) por café molido. Las fotos
aportadas por el equipo (Agua con Gas = soda, Zapallito, Rúcula, Premezcla para
Panqueques, Grisines…) se usaron tal cual aunque muestren marca.

**Pendiente:** ~109 productos siguen con foto de envase de Open Food Facts
(listados con `fuente = Open Food Facts` en `assets/catalogo/creditos.json`). Hay
candidatos genéricos ya descargados para la mayoría, falta elegirlos a ojo.

### 18. Licencias de las fotos

Open Food Facts publica las fotos bajo CC BY-SA 3.0; las de Wikimedia Commons tienen
licencia propia por archivo (se descartan las "no comerciales"); las aportadas por el
equipo figuran como "a confirmar". `assets/catalogo/creditos.json` es la fuente de
verdad y `CREDITOS.md` se genera con `node scripts/generar-imagenes-catalogo.mjs`.
Requisito futuro (pedido del equipo): pantalla de **Términos y Condiciones** con los
créditos, la aceptación de que las fotos y productos que mandan los usuarios pueden
usarse para productos futuros, y que las sugerencias de usuarios las aprueban los
administradores (el flujo de sugerencias + aprobación ya existe).

---

## F. Proceso y coordinación

### 19. Ramas y PRs apilados, ambiguos

**Síntoma:** pedidos como "pull del branch 10/11" eran ambiguos ("pull" = `git pull` o
pull request; "10" = número de PR, no de rama).

**Resolución:** PRs apilados #10 (invitar por mail) → #11 (docs OCR) → #12 (Edge Functions)
→ #13 (app), combinados con *merge* (sin force-push). Se abrió el #14 y se cerró a
pedido: **regla vigente: seguir actualizando el mismo PR (#13)**, no abrir PRs nuevos
por cada ajuste. `main` exige PR aprobado (ver `AGENTS.md`).

### 20. Dos sesiones trabajando en la misma carpeta y rama

**Síntoma:** archivos modificados "en disco" que no eran de quien estaba trabajando
(la sesión del Sprint 8 de voz y esta compartían directorio y rama), riesgo de
mezclar cambios en un commit y de chocar con `.git/index.lock`.

**Mitigación:** agregar siempre archivos por ruta (nunca `git add -A`), avisar antes de
commitear y coordinar el orden de los pushes por mensajes entre sesiones. Los tests
de Gemini estaban duplicados (`gemini.test.ts` y `geminiRespaldo.test.ts`): se
unificaron en el segundo.

### 21. `npx tsc --noEmit` fallaba por un test que usa `node:fs`

**Causa:** `tsconfig.json` solo carga los tipos de jest; `catalogoImagenes.test.ts`
lee `assets/catalogo` con `node:fs`/`__dirname`.
**Solución:** `/// <reference types="node" />` solo en ese test.

### 22. Conteo de tests inflado

Jest también corría una copia del proyecto en `.claude/worktrees/`, duplicando suites.
`package.json` ahora ignora esa carpeta (`testPathIgnorePatterns`); el total real es
**14 suites / 286 tests**. Quedan avisos "Cannot log after tests are done" sin causa
investigada (no fallan nada).
