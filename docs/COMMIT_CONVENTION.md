# Conventional Commits (Profesional)

## Tipos de commit
| Tipo | Uso | Ejemplo |
| :-- | :-- | :-- |
| feat | Nueva funcionalidad | feat: add product catalog page |
| fix | Corrección de bug | fix: correct cart total calculation |
| refactor | Cambio sin alterar funcionalidad | refactor: extract product service logic |
| perf | Mejora de rendimiento | perf: optimize sqlite query for products |
| style | Formato sin afectar código | style: apply prettier formatting |
| test | Añadir/modificar tests | test: add unit tests for cart service |
| docs | Documentación | docs: add commit convention guide |
| chore | Tareas de mantenimiento/config | chore: update .gitignore |
| build | Cambios en build system | build: update angular config |
| ci | Cambios en CI/CD | ci: add lint workflow |
| revert | Revertir commit anterior | revert: revert \"feat: add xyz\" |
| hotfix | Corrección urgente | hotfix: fix crash on startup |

## Formato
`
<type>(<scope>): <subject>
`
- scope: opcional (módulo/componente afectado)
- subject: imperativo, minúsculas, sin punto final, max 50 caracteres

## Reglas
- Un commit = un cambio lógico
- Commits pequeños y verificables
- No subir node_modules, dist, www, ios, android
- Usar imperativo: add, fix, remove, update, refactor
- Si hay breaking change: añadir BREAKING CHANGE: en footer
