# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Flujo de ramas (obligatorio para cualquier funcionalidad nueva)

Este proyecto usa un flujo de rama por funcionalidad + revisión de QA
antes de tocar `main`. Esto aplica sin importar en qué computadora o
sesión de Claude Code se esté trabajando — es una regla del repo, no de
una persona puntual (los roles de desarrollo/QA rotan entre el equipo,
ver docs/plan-de-testing.md).

**Antes de empezar a programar una funcionalidad:**
1. Asegurate de estar parado sobre `main` actualizado:
   `git checkout main && git pull`.
2. Creá una rama nueva a partir de ahí:
   `git checkout -b feature/<nombre-corto-de-la-funcionalidad>`
   (ejemplo: `feature/abm-hogar`, `feature/vencimiento-productos`).
3. Todos los commits de esa funcionalidad van en esa rama, nunca
   directo en `main`.

**Al terminar (antes de que QA revise):**
4. Pushear la rama (`git push -u origin feature/<nombre>`) y abrir un
   Pull Request hacia `main` en GitHub (`gh pr create` o desde la web).
   No hacer merge local directo — el PR es donde QA revisa.
5. QA prueba la rama siguiendo `docs/plan-de-testing.md` (incluida la
   regresión de sprints anteriores). Solo después de que QA aprueba el
   PR se mergea a `main`.
6. Después de mergear, borrar la rama (`git push origin --delete
   feature/<nombre>`) para no acumular ramas viejas.

**Excepción:** cambios chicos que no son una funcionalidad (typos,
ajustes de documentación, config) pueden ir directo a `main` sin rama,
a criterio de quien los hace.

Esta regla es para cualquier Claude que trabaje en este repo: si te
piden implementar una funcionalidad nueva y estás parado en `main`,
creá la rama primero, sin necesidad de que te lo pidan explícitamente
cada vez.
