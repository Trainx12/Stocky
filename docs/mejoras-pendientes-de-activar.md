# Ideas en pausa (pendientes de aprobar por el equipo)

Estado al 2026-10-13: **programadas y con tests, pero NO activas.** Quedan
como ideas futuras hasta que las apruebe el equipo de Stocky. El código está
en la rama `feature/mejoras-experiencia` (PR #21, en borrador). No se aplicó
su migración, no se desplegó su Edge Function y no se publicó nada.

> "Contanos qué mejorar" y "Borrar mi cuenta", que también estaban en esa
> rama, **ya se activaron** con el panel de administración (rama
> `feature/panel-admin`, ver [plan-de-testing.md](plan-de-testing.md)).

## Qué incluye

| Idea | Dónde se vería | Qué hace |
|---|---|---|
| **Lista de compras** | Inicio → Accesos rápidos, y "Stock bajo" | Lista compartida por hogar y en tiempo real. Sugiere lo de stock bajo, se tilda en el súper y "Guardé las compras" lo carga en la despensa. Si el − de la despensa deja un producto en 0, ofrece pasarlo a la lista. |
| **¿Qué cocino con esto?** | Inicio → "Productos próximos a vencer" | Gemini propone 2-3 recetas con lo que vence pronto (nunca con lo vencido). Edge Function `recetas`. |
| **Resumen del mes** | Inicio, tarjeta "Tu <mes> en <hogar>" | Cuánto se cargó, se usó y se venció en el mes, con un mensaje. |

Detalle técnico y pruebas: en la rama `feature/mejoras-experiencia`,
`docs/arquitectura-del-codigo.md` y `docs/plan-de-testing.md`, secciones
"Mejoras de experiencia".

## Cómo activarlas (si se aprueban)

La rama se armó antes del panel de administración, así que primero hay que
**actualizarla** sobre la rama del panel y sacarle lo que ya se activó
(comentarios y borrar cuenta ya existen en la base):

1. Pasar la rama arriba de `feature/panel-admin` y resolver los conflictos
   (la migración `20261017120000_...` vuelve a crear `comentarios` y
   `eliminar_mi_cuenta`: quedarse solo con `lista_compras` y
   `resumen_del_mes`).
2. Términos: sumar la lista de compras y las recetas con Gemini, y subir
   `VERSION_TERMINOS` (todos los aceptan de nuevo una vez).
3. QA prueba y aprueba el PR.
4. Aplicar la migración, revisar `get_advisors`, desplegar
   `supabase/functions/recetas` (JWT obligatorio, usa `GEMINI_API_KEY`).
5. Recién ahí publicar (`npm run publicar:app` y `npm run publicar:web`).

Hasta entonces, **no publicar desde `feature/mejoras-experiencia`**.
