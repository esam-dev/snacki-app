# Snacki App

Aplicación móvil para gestión de snacks/pedidos construida con **Ionic 9 + Angular 22 + Capacitor 8 + SQLite**.

## Stack Tecnológico

- **Framework**: [Ionic](https://ionicframework.com/) 9.0.9
- **Frontend**: [Angular](https://angular.io/) 22.2.3 (Standalone Components)
- **Mobile Runtime**: [Capacitor](https://capacitorjs.com/) 8.5.3
- **Base de Datos Local**: [@capacitor-community/sqlite](https://github.com/capacitor-community/sqlite) 8.1.1
- **Almacenamiento**: [@capacitor/preferences](https://capacitorjs.com/docs/apis/preferences) 8.0.0
- **Sistema de archivos**: [@capacitor/filesystem](https://capacitorjs.com/docs/apis/filesystem) 8.0.0

## Arquitectura

La aplicación sigue una arquitectura modular basada en **feature modules** con componentes standalone:

`
src/app/
├── core/           # Servicios singleton, guards, modelos, utilidades
├── shared/         # Componentes, pipes, directivas reutilizables
├── features/       # Módulos funcionales de la aplicación
├── data/           # Capa de datos (SQLite, repositorios)
└── app.routes.ts   # Configuración de rutas
`

## Requisitos

- Node.js 18+ / 24+
- npm 9+
- Android Studio (para Android)
- Xcode (para iOS, solo macOS)

## Instalación

`ash
npm install
`

## Desarrollo

`ash
# Servidor de desarrollo web
npm start

# Build
npm run build

# Tests
npm test

# Lint
npm run lint
`

## Capacitor

`ash
# Añadir plataformas
npx cap add android
npx cap add ios

# Sincronizar cambios
npx cap sync

# Abrir en IDE nativo
npx cap open android
npx cap open ios
`

## Base de Datos SQLite

La app utiliza SQLite local para almacenamiento offline. Ver [docs/DATABASE.md](docs/DATABASE.md) para más detalles.

## Convenciones

- **Componentes**: Standalone components con prefijo pp-
- **Servicios**: Inyectables con providedIn: 'root'
- **Rutas**: Lazy loading por feature
- **Estilos**: SCSS con variables de Ionic
- **TypeScript**: Strict mode habilitado

## Licencia

Privado
