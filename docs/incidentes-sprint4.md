# Incidentes y soluciones — Sprint 4

Registro de los problemas no triviales encontrados durante el catálogo
global de productos (RF pedida directamente por el equipo: cargar un
producto ya no es texto libre, se elige de una lista con foto, y se puede
sugerir uno nuevo para que un admin lo apruebe). Mismo espíritu que
[docs/incidentes-sprint1.md](incidentes-sprint1.md),
[docs/incidentes-sprint2.md](incidentes-sprint2.md) y
[docs/incidentes-sprint3.md](incidentes-sprint3.md): que si un error
parecido vuelve a aparecer, no haya que redescubrirlo de cero.

---

## 1. `hogares.test.ts` en `main` seguía con el mock desactualizado de `listarMisHogares`

**Síntoma:** al arrancar esta rama desde `main` recién actualizado y
correr `npm test` como paso de rutina antes de programar, 4 tests de
`describe('listarMisHogares', ...)` fallaban (mock de `.eq()` sin
`.in()`, aserciones sin el campo `solicitudesPendientes`).

**Causa raíz:** exactamente el mismo problema que ya se encontró y
arregló en `feature/limite-nombre-hogar` y en `feature/invitar-por-email`
(ver el incidente equivalente documentado en esas ramas): el commit que
agregó el conteo de solicitudes pendientes a `listarMisHogares()` nunca
actualizó sus propios tests. Como esas tres ramas partieron todas de
`main` antes de que ese fix llegara a mergearse ahí, cada una lo
encontró (y arregló) por separado.

**Solución:** mismo fix de siempre -- `mockEq` ahora resuelve tanto
`.order()` como `.in()`, y los 4 tests afectados esperan
`solicitudesPendientes: 0` en el resultado.

**Cómo evitar que vuelva a pasar:** cuando este fix llegue a `main` (por
la primera de estas tres ramas que se mergee), las otras dos van a traer
el mismo cambio duplicado -- no hay nada raro en eso, git lo resuelve
solo al mergear (mismo contenido final). Lo que sí conviene: si alguien
ve este mismo fallo por CUARTA vez en una rama nueva, es señal de que
conviene mergear a `main` la rama que ya lo tiene resuelto en vez de
seguir parcheándolo por rama.

---

## 2. Notas de diseño del catálogo (no son bugs, pero conviene dejarlas escritas)

- **Fotos pendientes:** `productos_catalogo.imagen_url` queda `null` en
  toda la semilla cargada con la migración -- el equipo va a pasar
  imágenes reales (de [Open Food Facts](https://world.openfoodfacts.org),
  base de datos abierta de productos con fotos) para completarlas
  después. Mientras tanto, `CatalogoSelectorModal` muestra un ícono
  genérico (🧺) en vez de romper o dejar un hueco en blanco.
- **Enforcement del lado del cliente, no del servidor:** que "solo se
  pueda cargar un producto del catálogo" es una regla de UI
  (`ProductoFormModal` ya no tiene un campo de texto libre para el
  nombre), no un constraint de base -- mismo criterio que el resto de la
  validación de `productos.ts`/`hogares.ts` en este proyecto. Alguien que
  hable directo con la API de Supabase (no con la app) podría insertar
  cualquier `nombre` en `productos`. Si en algún momento hace falta cerrar
  ese hueco de verdad, la forma prolija es un trigger que valide
  `catalogo_id` contra una fila `aprobado`, no repetir la validación de
  texto en más lugares.
- **Primera pantalla gateada por rol:** `AdminSugerenciasScreen` es la
  primera pantalla de la app que un usuario común no debería ver -- el
  gateo real es la RLS (`es_administrador()` en las policies de
  `productos_catalogo`), no la navegación: `RootNavigator` sigue sin
  mirar el rol (eso es RF9, Sprint 9), `HomeScreen` simplemente no le
  muestra el botón a quien no sea admin, y si alguien fuerza la
  navegación de todos modos, la RLS igual no le devuelve ninguna
  sugerencia ajena.
