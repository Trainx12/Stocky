# Mejoras pendientes de activar

Estado al 2026-10-12: **programadas y con tests, pero NO activas.** Por
decisión del equipo, por ahora no se aplicó la migración, no se desplegó la
Edge Function y no se publicó nada de esto en la app ni en la web. El código
está en la rama `feature/mejoras-experiencia` (PR #21, en borrador, apilado
sobre `feature/logo`).

## Qué incluye

| Funcionalidad | Dónde se ve | Qué hace |
|---|---|---|
| **Contanos qué mejorar** | Cuenta → Ajustes | El usuario manda una idea, un problema u otro comentario. Los administradores los leen en el inicio → "Comentarios". |
| **Borrar mi cuenta** | Cuenta, al final | Borra la cuenta para siempre (con dos confirmaciones). Si era dueño de un hogar con más gente, el rol pasa al miembro más antiguo; los hogares donde estaba solo se borran. |
| **Lista de compras** | Inicio → Accesos rápidos, y "Stock bajo" | Lista compartida por hogar y en tiempo real. Sugiere lo de stock bajo, se tilda en el súper y "Guardé las compras" lo carga en la despensa. Si el − de la despensa deja un producto en 0, ofrece pasarlo a la lista. |
| **¿Qué cocino con esto?** | Inicio → "Productos próximos a vencer" | Gemini propone 2-3 recetas con lo que vence pronto (nunca con lo vencido). |
| **Resumen del mes** | Inicio, tarjeta "Tu <mes> en <hogar>" | Cuánto se cargó, se usó y se venció en el mes, con un mensaje. |

Detalle técnico: [arquitectura-del-codigo.md](arquitectura-del-codigo.md),
sección "Mejoras de experiencia". Pruebas: [plan-de-testing.md](plan-de-testing.md),
sección "Mejoras de experiencia".

## Ojo: cambian los Términos

La rama sube los Términos a la versión `2026-10-12` (suma la lista de
compras, los comentarios, las recetas con Gemini y cómo borrar la cuenta).
**Al activarla, todos los usuarios tienen que volver a aceptarlos una vez.**

## Cómo activarlas (en este orden)

1. **QA** prueba la rama según el plan de testing y aprueba el PR #21
   (después de los PRs de abajo de la cadena).
2. **Base de datos:** aplicar
   `supabase/migrations/20261017120000_lista_compras_comentarios_resumen_y_borrar_cuenta.sql`
   y revisar `get_advisors` (seguridad).
3. **Edge Function:** desplegar `supabase/functions/recetas` (con JWT
   obligatorio; usa el secret `GEMINI_API_KEY` que ya existe).
4. **Publicar** recién después de 2 y 3 (si no, la lista, los comentarios,
   el resumen y las recetas fallan):
   ```bash
   npm run publicar:app -- --message "Lista de compras, recetas, resumen, comentarios y borrar cuenta"
   npm run publicar:web
   ```

Hasta que se activen, **no publicar desde la rama
`feature/mejoras-experiencia`**: las publicaciones salen de `feature/logo`
(o de la rama que esté arriba de la cadena sin estas mejoras).
