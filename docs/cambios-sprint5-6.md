# Cambios — Sprints 5 y 6 (OCR de tickets, vencimiento por foto, marcas y catálogo con fotos)

Resumen de todo lo que se construyó y decidió en el PR #13
(`feature/escanear-ticket-vencimiento`, apilado sobre #10, #11 y #12). Los problemas
encontrados por el camino están en
[incidentes-sprint5-6.md](incidentes-sprint5-6.md). La evaluación de proveedores y el
criterio de aceptación están en [plan-de-testing.md](plan-de-testing.md) (Sprint 5).

## 1. Proveedores (decisión del Sprint 5)

| Función | Proveedor | Por qué |
|---|---|---|
| `ocr-ticket` (texto del ticket) | **OCR.space** (free: 25.000 pedidos/mes, archivos de hasta 1 MB) | Texto impreso con buen contraste; no hace falta "entender" la imagen. |
| `vencimiento-foto` (fecha del envase) | **Gemini Flash** (free: 5 RPM / ~250K TPM / 20 RPD medidos en AI Studio) | Un OCR clásico no distingue la fecha de vencimiento del lote o del código de barras; un modelo de visión sí. |

Criterio de aceptación definido: `ocr-ticket` ≥ 70 % de tickets con al menos un
producto reconocido; `vencimiento-foto` ≥ 60 % de fechas correctas y **nunca** una
fecha incorrecta con confianza (preferir `null` + "ingresala a mano"). Hasta hoy se
probó con ~6 tickets y varias fotos reales; no se midió formalmente el porcentaje.

## 2. Funcionalidad nueva en la app

**Escanear ticket** (`ProductosScreen` → `EscanearTicketModal`)
- Foto o galería → `ocr-ticket` → pantalla de revisión (cantidad, marca y, si no está en el
  catálogo, nombre/categoría/unidad editables; descartar renglones) → recién al
  confirmar se crean los productos.
- Lo que coincide con el catálogo arranca incluido; **lo que no, arranca sin incluir**
  ("Agregar igual") para que una línea mal leída nunca se guarde por descuido.
- Se guardan sin catálogo (`catalogo_id` nulo) los productos fuera del catálogo (cortes de
  carne, productos raros). No se inventa fecha de vencimiento.

**Foto del vencimiento** (`ProductoFormModal`, ícono de cámara junto al calendario)
- `vencimiento-foto` sugiere la fecha; solo se autocompleta si es `AAAA-MM-DD` válida y la
  confianza es ≥ 0,5. Nunca guarda sola.

**Marcas, duplicados y agotados**
- `productos.marca` (texto libre, ≤ 40): se carga en el formulario, se sugiere desde el
  ticket y se muestra como "Fideos · Lucchetti" en la lista y en "Próximos a vencer".
- Al crear un producto idéntico (mismo catálogo/nombre, marca y vencimiento) se **suma la
  cantidad** en vez de crear otra fila (`buscarDuplicado`).
- "Limpiar agotados": borra los de cantidad 0 **sin** stock mínimo (los que tienen mínimo se
  dejan: ese 0 es la señal de reposición).
- Cantidades decimales (3 l + 0,5 l = 3,5 l): teclado decimal y RPC `numeric`.

**Matching tolerante con el catálogo** (`src/services/escaneo.ts`): plural, orden de palabras,
palabras vacías y errores de OCR de una letra; gana el nombre más específico. La marca se
sugiere con lo que sobra del renglón (`extraerMarca`).

**Fotos** (`src/lib/fotos.ts`): cámara/galería; en web, selector propio y conversión de HEIC a
JPEG; toda foto se achica a 1400 px y se recomprime (límite de 1 MB de OCR.space).

## 3. Edge Functions (`supabase/functions/`)

- `ocr-ticket`: OCR.space (`api.ocr.space`, español) → `_shared/ticket.ts` (parser) →
  `_shared/filtroNoAlimentos.ts` (limpieza, higiene, etc.). Si salen < 2 productos deja en
  los logs el texto crudo del OCR para ajustar el parser.
- `vencimiento-foto` y `voz-a-texto`: comparten `_shared/gemini.ts` (modelos de respaldo,
  `thinkingLevel: minimal`, timeout, carrera en paralelo a los 5 s).
- Estado desplegado al escribir esto: `ocr-ticket` v8, `vencimiento-foto` v8, `voz-a-texto` v4
  (todas `verify_jwt: true`).
- **Secrets** (`supabase secrets set`, nunca en el cliente ni en el repo): `OCR_SPACE_KEY`,
  `GEMINI_API_KEY` y, opcional, `GEMINI_MODEL` (lista de modelos separada por comas,
  p. ej. `gemini-3.5-flash,gemini-3.5-flash-lite`). Ver `.env.example`.
- Redeployar con `import_map_path: "deno.json"` incluyendo `deno.json` y `_shared/` (ver incidente 3).
- Si `vencimiento-foto` falla: mirar `function_logs` primero (404 = modelo retirado,
  503 = saturado, 429 = cuota).

## 4. Migraciones (aplicadas al proyecto de Supabase y versionadas en `supabase/migrations/`)

| Archivo | Qué hace |
|---|---|
| `20260912120000_productos_marca.sql` | Columna `productos.marca` + `ajustar_cantidad_producto` con `numeric` |
| `20260913120000_catalogo_alimentos_argentina.sql` | +96 alimentos (flan, leche en polvo, pasta para sopa, porotos…) |
| `20260914120000_catalogo_alimentos_cotidianos_2.sql` | +87 alimentos (pastas por tipo, hierbas, frutas de estación, semillas, especias…) |
| `20260914130000_quitar_crema_larga_vida.sql` | Quita "Crema de Leche Larga Vida" (solo si nadie lo usa) |
| `20260914140000_quitar_cuscus.sql` | Quita "Cuscús" (solo si nadie lo usa) |

Todas las inserciones usan `on conflict (lower(nombre)) do nothing`. Reglas del catálogo: solo
alimentos; **sin** carnes, fiambres, congelados, pescado enlatado ni productos de limpieza o
higiene. (Las migraciones `20260915…` y `20260916…` son de otra línea de trabajo del mismo PR.)

## 5. Fotos del catálogo (`assets/catalogo/`)

- **257 fotos**, una por producto, ~4,2 MB, guardadas en el repo para no depender de ningún
  sitio externo. Cuadradas con fondo blanco (300 px) y mostradas con `resizeMode="contain"`.
- `imagenDeCatalogo(item)` (`src/lib/catalogoImagenes.ts`): primero la foto local, si no la URL de
  la base (productos aprobados después).
- **Cómo agregar o cambiar una foto:** copiar `nombre-del-producto.jpg` (slug sin tildes) a
  `assets/catalogo/`, cargar su entrada en `assets/catalogo/creditos.json` y correr
  `node scripts/generar-imagenes-catalogo.mjs`: regenera
  `src/lib/catalogoImagenes.generado.ts` (el mapa que usa la app, porque Metro exige
  `require()` literales) y `CREDITOS.md`. Los tests avisan si algo no coincide.
- Procedencia actual: Wikimedia Commons ≈ 141, Open Food Facts ≈ 109, aportadas por el equipo = 7
  (licencia "a confirmar").
- **Pendiente:** reemplazar las ~109 fotos de envase con marca (Open Food Facts) por fotos
  genéricas del producto entero, sin marca (criterio pedido por el equipo).

## 6. Tests de lógica agregados

Suite actual: **14 suites / 286 tests** (`npx jest`; `npx tsc --noEmit` limpio).

| Archivo | Cubre |
|---|---|
| `src/services/escaneo.test.ts` (23) | matching tolerante, sugerencia de marca, candidatos sin catálogo ("incluir"), fechas de Gemini, regresión Pimiento/Pimienta |
| `src/services/ticketParser.test.ts` (18) | los 6 formatos de ticket reales (La Genovesa, restaurante, Super Mora, Bravo, direcciones/rótulos), columnas separadas, anulaciones |
| `src/services/productos.test.ts` | unión de duplicados, marca, limpiar agotados, `nombreConMarca` (junto con el resto del ABM) |
| `src/services/externalApis.test.ts` (8) | wrappers y rescate del mensaje de error de las Edge Functions |
| `src/lib/catalogoImagenes.test.ts` (9) | slug, preferencia de foto local; consistencia de `assets/catalogo` (mapa ↔ archivos ↔ `creditos.json` ↔ `CREDITOS.md`, sin licencias "no comercial") |
| `src/lib/fotos.test.ts` (4) | detección de HEIC por tipo y por extensión |
| `src/services/geminiRespaldo.test.ts` (11) | respaldo entre modelos de Gemini (503/404/429, 400 sin thinking, key inválida, `GEMINI_MODEL`, carrera a los 5 s) |

No hay tests de UI: las pantallas (`EscanearTicketModal`, botón de cámara, selector con fotos)
se probaron a mano con tickets y fotos reales.

## 7. Pendientes y requisitos futuros

1. Reemplazar las ~109 fotos con marca por genéricas (ver sección 5).
2. **Términos y Condiciones** (pedido del equipo): créditos de las fotos (fuente: `CREDITOS.md`),
   aceptación de que las fotos y productos que envían los usuarios pueden usarse para
   productos futuros, y sugerencias de usuarios aprobadas por administradores (el flujo
   `sugerirProducto` + `AdminSugerenciasScreen` ya existe).
3. Confirmar permisos de uso de las 7 fotos aportadas por el equipo.
4. OCR de tickets difíciles (foto chica / tinta desvaída): recorte de la foto y Gemini como
   respaldo, cuidando la cuota gratuita (20 pedidos/día en total).
5. Medir el criterio de aceptación del Sprint 5 con un set fijo de tickets (hoy es informal).
6. Aviso de "procesando la foto" mientras se convierte un HEIC grande (~6 s en web).
7. Habilitar facturación en Google Cloud antes de producción (el free tier no alcanza para
   varios hogares).
