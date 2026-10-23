# Arquitectura - Snacki App

## Principios

- **Separación de responsabilidades**: Cada capa tiene un propósito claro
- **Standalone Components**: Sin NgModules, componentes independientes
- **Lazy Loading**: Carga bajo demanda de features
- **Offline First**: Datos almacenados localmente con SQLite
- **Type Safety**: TypeScript strict mode

## Capas

### Core
Servicios singleton, guards, interceptors, modelos base y utilidades compartidas por toda la app.

### Shared
Componentes UI reutilizables, pipes, directivas y módulos compartidos.

### Features
Cada feature es un módulo funcional independiente con sus propias rutas, componentes y lógica.

### Data
Capa de acceso a datos. Abstrae SQLite mediante repositorios para facilitar testing y mantenimiento.

## Flujo de Datos

1. **UI (Components)** → Llama a servicios
2. **Services** → Usa repositorios
3. **Repositories** → Interactúa con DatabaseService
4. **DatabaseService** → Ejecuta queries en SQLite

## Gestión de Estado

Por ahora se utiliza servicios con BehaviorSubject. En el futuro se puede migrar a signals o NgRx si es necesario.
