# Snacki App

Wallet de puntos para varios comercios de comida (heladerías, comida rápida, pizzerías y cafeterías). Snacki **no es una app de pedidos ni de pagos**: la compra se hace en el local. Sirve para que los negocios den a conocer rápido sus productos nuevos.

- El **comercio** crea productos en promoción que dan puntos y genera un QR cuando vende uno.
- El **cliente** escanea el QR, acumula puntos en ese comercio y los canjea por recompensas antes de que venzan.
- Los puntos de un comercio no sirven en otro.

Plan de trabajo, ramas y responsables: [docs/PLAN-DE-TRABAJO.md](docs/PLAN-DE-TRABAJO.md).

## Stack

| Parte | Tecnología |
|---|---|
| App móvil | Ionic 9 + Angular 22 (standalone) + Capacitor 8 |
| Datos locales (offline) | SQLite (`@capacitor-community/sqlite`) |
| Escáner QR | `@capacitor-mlkit/barcode-scanning` |
| Backend | Node.js + TypeScript + Fastify 5 |
| Base de datos | PostgreSQL 16 + Prisma 6 |
| Autenticación | JWT |
| Despliegue | Railway (API + Postgres) |

## Estructura

```
snacki-app/
├── src/              # App Ionic/Angular (pages, services, shared)
├── backend/          # API Fastify + Prisma
│   ├── prisma/       # schema, migraciones y seed
│   └── src/modules/  # auth, tenants, ...
├── docs/             # Plan de trabajo, flujo QR, lógica de puntos
└── capacitor.config.ts
```

## Requisitos

Instalar antes de empezar:

| Herramienta | Versión | Para qué |
|---|---|---|
| [Node.js](https://nodejs.org/) | 22 LTS o superior | App y backend |
| npm | viene con Node | Dependencias |
| [Git](https://git-scm.com/) | cualquiera reciente | Código |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | cualquiera reciente | Postgres local (si no lo instalas a mano) |
| [Android Studio](https://developer.android.com/studio) | con SDK de Android y JDK 21 | Solo para generar/probar la APK |

Opcional: Ionic CLI (`npm install -g @ionic/cli`) y VS Code con las extensiones recomendadas en `.vscode/extensions.json`.

## Cómo correr el proyecto

Hay que levantar **3 cosas**, en este orden: base de datos → backend → app.

### 1. Clonar e instalar

```bash
git clone https://github.com/esam-dev/snacki-app.git
cd snacki-app
git checkout develop
npm install
cd backend
npm install
```

### 2. Base de datos (PostgreSQL)

Desde `backend/`:

```bash
docker compose up -d postgres
```

Queda en `localhost:5432` con usuario, contraseña y base `snacki`. Para detenerla: `docker compose down`.

### 3. Backend

Desde `backend/`:

```bash
cp .env.example .env        # en PowerShell: Copy-Item .env.example .env
npm run prisma:generate     # genera el cliente de Prisma
npm run prisma:migrate      # crea las tablas
npm run prisma:seed         # carga datos de prueba
npm run dev                 # API en http://localhost:3000
```

Revisa que funcione abriendo http://localhost:3000/health. Tiene que responder `{"status":"ok"}`.

Variables de `backend/.env`:

| Variable | Descripción |
|---|---|
| `PORT` | Puerto de la API (3000) |
| `DATABASE_URL` | Conexión a Postgres |
| `JWT_SECRET` | Secreto para firmar sesiones (en producción, uno largo y aleatorio) |
| `JWT_EXPIRES_IN` | Duración del token en segundos |
| `CORS_ORIGIN` | Orígenes permitidos, separados por coma |
| `PLATFORM_TENANT_NAME` / `PLATFORM_TENANT_SLUG` | Comercio base del sistema |

> `.env` nunca se sube al repositorio. Solo se versiona `.env.example`.

### 4. App (navegador)

En otra terminal, desde la raíz del proyecto:

```bash
npm start
```

Abre http://localhost:4200. La app llama a la API definida en `src/environments/environment.ts` (`apiBaseUrl: 'http://localhost:3000'`).

**Usuarios de prueba** (creados por el seed, contraseña `Demo1234!`):

| Rol | Email |
|---|---|
| Cliente | `cliente@snacki.demo` |
| Comercio | `comercio@snacki.demo` |

> En el navegador la cámara y algunos plugins nativos (escáner, notificaciones) no funcionan igual que en el celular. Para probarlos usa Android.

### 5. App en Android

Desde la raíz del proyecto:

```bash
npm run build
npx cap add android        # solo la primera vez
npx cap sync android
npx cap open android       # abre Android Studio → Run ▶
```

- El celular **no puede usar `localhost`** de tu PC. Cambia `apiBaseUrl` en `src/environments/environment.prod.ts` a la URL de Railway o a la IP de tu PC en la red (ej. `http://192.168.1.10:3000`) y agrega ese origen a `CORS_ORIGIN`.
- Después de cada cambio en el código: `npm run build` y `npx cap sync android`.

## Comandos útiles

| Dónde | Comando | Qué hace |
|---|---|---|
| raíz | `npm start` | App en modo desarrollo |
| raíz | `npm run build` | Compila la app en `www/` |
| raíz | `npm test` | Tests del frontend |
| raíz | `npm run lint` | Lint |
| backend | `npm run dev` | API con recarga automática |
| backend | `npm run build` / `npm start` | Compila y corre la API en modo producción |
| backend | `npm test` | Tests del backend (Vitest) |
| backend | `npm run prisma:migrate` | Crea una migración nueva tras cambiar `schema.prisma` |
| backend | `npm run prisma:seed` | Recarga datos de prueba |
| backend | `npx prisma studio` | Ver y editar la base en el navegador |

## Problemas comunes

- **`Can't reach database server`**: Postgres no está corriendo. Abre Docker Desktop y corre `docker compose up -d postgres`.
- **Puerto 5432 ocupado**: ya tienes otro Postgres instalado. Detenlo o cambia el puerto en `docker-compose.yml` y en `DATABASE_URL`.
- **`The migration ... was modified after it was applied`**: tu base local tiene una versión vieja de la migración inicial. Desde `backend/`, corre `npx prisma migrate reset` (borra la base local y vuelve a crearla con el seed).
- **Error de CORS en la app**: agrega el origen de la app a `CORS_ORIGIN` y reinicia el backend.
- **Login falla en el celular**: `apiBaseUrl` apunta a `localhost`. Mira la sección de Android.

## Forma de trabajo

- Cada tarea va en su propia rama, creada desde `develop` (ver ramas en [el plan](docs/PLAN-DE-TRABAJO.md)).
- Commits con [Conventional Commits](docs/COMMIT_CONVENTION.md) (`feat:`, `fix:`, `docs:`...).
- Se integra a `develop` por Pull Request, revisado por la otra persona. `main` queda para la entrega.

## Documentación

- [Plan de trabajo](docs/PLAN-DE-TRABAJO.md)
- [Flujo QR y puntos](docs/FLUJO-QR-PUNTOS.md)
- [Lógica de puntos por comercio](docs/LOGICA-PUNTOS-POR-COMERCIO.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Backend](backend/README.md)

## Licencia

Privado.
