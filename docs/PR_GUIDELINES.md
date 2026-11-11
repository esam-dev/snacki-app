# Guia de Pull Requests

## Objetivo
Mantener PRs claros, revisables y trazables siguiendo Conventional Commits.

## Reglas
- Un PR = un objetivo. Evita mezclar features, fixes y refactors en el mismo PR.
- Titulo claro. Usa el mismo formato que los commits: feat:, fix:, docs:, chore:
- Descripcion completa. Usa siempre la plantilla .github/pull_request_template.md.
- Commits atomicos. Cada commit debe representar un cambio logico y verificable.
- Pequeno y enfocado. Cuanto mas pequeno, mas fácil de revisar.
- Sin archivos innecesarios. Nunca subir node_modules, dist, www, ios, android.
- Sin secretos. Revisar antes de pushear claves, tokens o .env.

## Flujo de trabajo
1. Crear rama desde main o feature/base-architecture con nombre claro: feature/nombre-funcionalidad
2. Hacer commits siguiendo docs/COMMIT_CONVENTION.md
3. Hacer git push de la rama
4. Crear PR hacia main usando la plantilla
5. Pasar checklist, solicitar revision y mergear solo tras aprobacion

## Buenas practicas
- Imperativo en commits: add, fix, update, remove, refactor
- Usar scope cuando aplique: feat(auth): add login flow
- Explicar el por que en la descripcion del PR, no solo el que
- Actualizar documentacion si el cambio lo requiere
