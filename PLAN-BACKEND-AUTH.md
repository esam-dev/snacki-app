# PLAN-BACKEND-AUTH.md — Base Backend y Autenticación Real (Snacki)

> **Estado:** Plan técnico (sin implementación en esta entrega).  
> **Alcance:** Reemplazar la autenticación demo basada en `localStorage` por backend real + JWT, manteniendo el flujo actual de navegación (`/tabs` cliente, `/comercio` comercio).  
> **Contexto revisado:** `src/app/services/auth.service.ts`, `src/app/services/role.guard.ts`, `src/app/pages/login/*`, `src/app/pages/register/*`, `src/app/app.routes.ts`, `src/main.ts`, `package.json`.  
> **Nota:** No existe `ESTADO-PROYECTO.md` en la raíz al momento de este plan; se toma como baseline el estado actual del repositorio y la rama integrada `develop`.

---

## 1. Objetivos y principios

- Separar **frontend (Ionic/Angular)** y **backend (API + DB)** en carpetas independientes.
- Implementar autenticación real con **credenciales verificadas en servidor**, **JWT**, y **roles por tenant** (multitenant).
- Preservar UX/rutas actuales: login/register → redirección por rol a `/tabs/home` (cliente) o `/comercio` (comercio), con `returnUrl` seguro.
- Migración incremental y reversible por bloques, sin romper el flujo existente durante la transición.
- Seguridad base: hash de contraseñas en servidor, validación de entrada, no exponer secretos/PII en logs, aislamiento por `tenant_id`.

---

## 2. Arquitectura de carpetas del Backend

Se propone crear `backend/` en la raíz del monorepo (sin mover el frontend). Stack recomendado: **Node.js + TypeScript + Fastify + Prisma + PostgreSQL**, listo para Docker. (Alternativa válida: NestJS o Express manteniendo la misma separación por capas; se elige Fastify por rendimiento y tipado directo, pero los contratos y capas son equivalentes.)

```text
backend/
  docker-compose.yml
  Dockerfile
  .env.example
  .dockerignore
  package.json
  tsconfig.json
  prisma/
    schema.prisma
    migrations/
    seed.ts                  # opcional: tenants/usuarios demo controlados
  src/
    app.ts                   # construcción de Fastify, plugins, hooks
    server.ts                # bootstrap / listen
    config/
      env.ts                 # carga/validación de variables (zod o similar)
      cors.ts
    modules/
      auth/
        auth.routes.ts       # /api/auth/*
        auth.controller.ts   # mapeo HTTP <-> servicio
        auth.service.ts      # login/register/me, emisión JWT
        auth.schemas.ts      # validación request/response (JSON schema/zod)
      tenants/
        tenants.routes.ts    # /api/tenants
        tenants.controller.ts
        tenants.service.ts
        tenants.schemas.ts
      users/
        users.repository.ts  # acceso datos usuario (vía Prisma)
        users.service.ts
    common/
      plugins/
        prisma.plugin.ts     # lifecycle PrismaClient
        auth.plugin.ts       # verificación JWT, decorador request.user
      middleware/
        authenticate.ts      # preHandler JWT requerido
        authorize.ts         # preHandler por rol/tenant
      errors/
        app-error.ts
        error-handler.ts     # mapeo a HTTP consistente
      types/
        jwt.ts               # JwtPayload, AuthContext
        api.ts               # envelope de respuesta/errores
    lib/
      prisma.ts              # singleton PrismaClient (dev hot-reload safe)
      password.ts            # hash/verify (argon2 o bcrypt)
      jwt.ts                 # sign/verify helpers
  test/
    integration/
    unit/
```

### Convenciones backend
- **Routes**: solo wiring HTTP + validación de esquema.
- **Controllers**: orquestación request/response, sin lógica de negocio compleja.
- **Services**: reglas de negocio (unicidad correo, asignación rol/tenant, emisión token).
- **Repositories/Prisma**: acceso a datos; queries siempre filtradas por `tenant_id` cuando aplique.
- **Errores**: nunca devolver stack traces ni detalles internos al cliente; usar códigos/mensajes controlados.
- **Config**: secretos solo por env (`JWT_SECRET`, `DATABASE_URL`), nunca hardcodeados.

### Docker (base)
- `docker-compose.yml`: servicios `api` + `postgres` (volumen persistente), red interna, healthchecks.
- `Dockerfile`: multi-stage (deps/build/runtime), usuario no-root, `NODE_ENV=production`.
- `.env.example`: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CORS_ORIGIN`.

---

## 3. Esquema inicial de Base de Datos (ERD y modelos)

### 3.1 ERD (texto)

```text
+------------------+           +-------------------------+           +------------------+
|      users       |           |    user_tenant_roles    |           |     tenants      |
+------------------+           +-------------------------+           +------------------+
| id (PK, uuid)    |<----+     | id (PK, uuid)           |     +---->| id (PK, uuid)    |
| email (unique)   |     +-----| user_id (FK -> users)   |     |     | name             |
| password_hash    |           | tenant_id (FK -> tenants)|-----+     | slug (unique)    |
| full_name        |           | role (enum)             |           | is_active        |
| is_active        |           | created_at              |           | created_at       |
| created_at       |           | updated_at              |           | updated_at       |
| updated_at       |           +-------------------------+           +------------------+
+------------------+             UNIQUE(user_id, tenant_id)

Relaciones:
- users 1..N user_tenant_roles N..1 tenants
- Un usuario puede tener rol en uno o más tenants (futuro), pero el MVP puede limitar a 1 membership activa por usuario según regla de negocio.
- Aislamiento multitenant: toda entidad de negocio futura debe incluir tenant_id y consultarse filtrando por tenant_id del contexto autenticado.
```

### 3.2 Reglas de dominio (MVP)
- **Roles soportados:** `cliente` | `comercio` (enum).
- **Correo único global** (`users.email` unique) para evitar ambigüedad de identidad (alineado con comportamiento actual del registro demo).
- **`user_tenant_roles`**: fuente de verdad de autorización por tenant.
  - `cliente`: membership asociada a un tenant "global/plataforma" (p.ej. slug `snacki`) o al tenant donde opera como consumidor, según decisión de producto; para MVP se recomienda **tenant plataforma fijo** para clientes + rol `cliente`.
  - `comercio`: membership asociada al `tenant` del comercio (`tenants.id`) con rol `comercio`.
- **Constraint recomendado:** `UNIQUE(user_id, tenant_id)` y, si el MVP exige un solo rol activo por usuario, `UNIQUE(user_id)` o validación en servicio.
- **Contraseñas:** solo `password_hash` (argon2id recomendado; bcrypt alternativa). Nunca almacenar texto plano ni hashes demo en cliente.

### 3.3 Modelos Prisma (propuestos)

```prisma
// prisma/schema.prisma (extracto)
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserTenantRole {
  cliente
  comercio
}

model User {
  id           String           @id @default(uuid()) @db.Uuid
  email        String           @unique
  passwordHash String           @map("password_hash")
  fullName     String           @map("full_name")
  isActive     Boolean          @default(true) @map("is_active")
  createdAt    DateTime         @default(now()) @map("created_at")
  updatedAt    DateTime         @updatedAt @map("updated_at")
  memberships  UserTenantRoleMap[]

  @@map("users")
}

model Tenant {
  id          String              @id @default(uuid()) @db.Uuid
  name        String
  slug        String              @unique
  isActive    Boolean             @default(true) @map("is_active")
  createdAt   DateTime            @default(now()) @map("created_at")
  updatedAt   DateTime            @updatedAt @map("updated_at")
  memberships UserTenantRoleMap[]

  @@map("tenants")
}

model UserTenantRoleMap {
  id        String         @id @default(uuid()) @db.Uuid
  userId    String         @map("user_id") @db.Uuid
  tenantId  String         @map("tenant_id") @db.Uuid
  role      UserTenantRole
  createdAt DateTime       @default(now()) @map("created_at")
  updatedAt DateTime       @updatedAt @map("updated_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([tenantId, role])
  @@map("user_tenant_roles")
}
```

> **Nota de mapeo con frontend actual:** `SnackiUser.comercioId` (string demo) se reemplazará por `tenantId` (uuid) y/o `tenant.slug` según contrato; el frontend deberá dejar de depender de ids locales de `StoreService` sin validación servidor.

---

## 4. Contratos de API REST

### 4.1 Convenciones generales
- **Base URL:** `/api`
- **Content-Type:** `application/json; charset=utf-8`
- **Auth:** `Authorization: Bearer <access_token>` para endpoints protegidos.
- **Formato de éxito (recomendado):**
  ```json
  { "data": { /* ... */ }, "meta": { /* opcional */ } }
  ```
- **Formato de error (consistente):**
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Datos inválidos",
      "details": [{ "field": "email", "message": "Formato inválido" }]
    }
  }
  ```
- **Códigos de error estándar:** `400` validación, `401` no autenticado/token inválido, `403` sin permisos/rol o tenant, `404` no encontrado, `409` conflicto (email/slug duplicado), `500` error interno.

### 4.2 Estructura JWT (access token)
- **Algoritmo:** `HS256` (MVP) con `JWT_SECRET` robusto; rotación/RS256 en fases posteriores si aplica.
- **Claims mínimos:**
  - `sub`: `user.id` (uuid)
  - `email`: correo
  - `role`: `cliente` | `comercio` (rol activo del contexto)
  - `tenantId`: uuid del tenant asociado al rol activo
  - `iat`, `exp` (p.ej. 15m–1h; definir política)
- **Respuesta de autenticación (token envelope):**
  ```json
  {
    "accessToken": "<jwt>",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
  ```
- **Refresh token:** fuera del alcance mínimo de este bloque base (recomendado como siguiente iteración); si se omite, documentar re-login al expirar.

### 4.3 `POST /api/auth/register`
Crea usuario, asigna rol/tenant según tipo y devuelve sesión autenticada.

**Request**
```json
{
  "fullName": "Ana Pérez",
  "email": "ana@example.com",
  "password": "Secreta123!",
  "accountType": "cliente",
  "tenantId": null
}
```
- `accountType`: `"cliente"` | `"comercio"` (obligatorio).
- `tenantId`: **obligatorio y uuid válido** cuando `accountType = "comercio"`; **null/omitido** cuando `accountType = "cliente"` (se asigna tenant plataforma por defecto en servidor).
- Validaciones: email formato, password política mínima (longitud/complexidad), `fullName` no vacío.

**Response `201 Created`**
```json
{
  "data": {
    "user": {
      "id": "uuid-user",
      "fullName": "Ana Pérez",
      "email": "ana@example.com",
      "isActive": true
    },
    "membership": {
      "role": "cliente",
      "tenantId": "uuid-tenant-plataforma",
      "tenantSlug": "snacki",
      "tenantName": "Snacki"
    },
    "auth": {
      "accessToken": "<jwt>",
      "tokenType": "Bearer",
      "expiresIn": 3600
    }
  }
}
```

**Errores**
- `400 VALIDATION_ERROR`: campos faltantes/inválidos, `tenantId` requerido para comercio.
- `404 TENANT_NOT_FOUND`: `tenantId` de comercio inexistente/inactivo.
- `409 EMAIL_ALREADY_EXISTS`: correo ya registrado.

### 4.4 `POST /api/auth/login`
Autentica credenciales y devuelve JWT + contexto de rol/tenant.

**Request**
```json
{
  "identifier": "ana@example.com",
  "password": "Secreta123!",
  "accountType": "cliente"
}
```
- `identifier`: email (MVP recomendado). Se puede aceptar username en futuro, pero el contrato debe ser explícito; para compatibilidad con UI actual ("usuario o correo") el backend puede intentar resolución por email y, si se define, por nombre único — **recomendación MVP: login por email** y ajustar UI.
- `accountType`: requerido para seleccionar contexto de rol esperado (evita ambigüedad si un email tuviera múltiples memberships en el futuro) y para mantener paridad con el selector actual de login.

**Response `200 OK`**
```json
{
  "data": {
    "user": {
      "id": "uuid-user",
      "fullName": "Ana Pérez",
      "email": "ana@example.com",
      "isActive": true
    },
    "membership": {
      "role": "cliente",
      "tenantId": "uuid-tenant-plataforma",
      "tenantSlug": "snacki",
      "tenantName": "Snacki"
    },
    "auth": {
      "accessToken": "<jwt>",
      "tokenType": "Bearer",
      "expiresIn": 3600
    }
  }
}
```

**Errores**
- `400 VALIDATION_ERROR`: payload incompleto.
- `401 INVALID_CREDENTIALS`: credenciales inválidas (mensaje genérico, sin revelar si el email existe).
- `403 ROLE_MISMATCH` o `403 FORBIDDEN`: el usuario no posee membership para `accountType` solicitado / tenant inactivo / usuario inactivo.

### 4.5 `GET /api/auth/me`
Devuelve el usuario autenticado y su contexto de autorización derivado del JWT válido. Requiere `Authorization: Bearer`.

**Request**
- Sin body. Header: `Authorization: Bearer <access_token>`.

**Response `200 OK`**
```json
{
  "data": {
    "user": {
      "id": "uuid-user",
      "fullName": "Ana Pérez",
      "email": "ana@example.com",
      "isActive": true
    },
    "membership": {
      "role": "comercio",
      "tenantId": "uuid-tenant-comercio",
      "tenantSlug": "cafeteria-central",
      "tenantName": "Cafetería Central"
    },
    "session": {
      "issuedAt": "2026-11-20T12:00:00.000Z",
      "expiresAt": "2026-11-20T13:00:00.000Z"
    }
  }
}
```

**Errores**
- `401 UNAUTHORIZED`: token ausente, inválido, expirado o usuario inactivo.

### 4.6 `POST /api/tenants`
Crea un tenant (comercio). Endpoint protegido; política de acceso MVP: **solo usuarios autenticados con rol `comercio` y permiso de administración** o, si aún no existe flujo admin, restringir por mecanismo interno (seed/script) y exponer este endpoint en fase posterior. Para el plan base se define contrato y se recomienda **proteger con JWT + autorización** (p.ej. rol `comercio` owner/admin cuando exista) y registrar auditoría.

**Request**
```json
{
  "name": "Cafetería Central",
  "slug": "cafeteria-central"
}
```
- `slug`: opcional si se autogenera desde `name` (normalizado, único).

**Response `201 Created`**
```json
{
  "data": {
    "tenant": {
      "id": "uuid-tenant",
      "name": "Cafetería Central",
      "slug": "cafeteria-central",
      "isActive": true,
      "createdAt": "2026-11-20T12:00:00.000Z"
    }
  }
}
```

**Errores**
- `400 VALIDATION_ERROR`: nombre/slug inválido.
- `401 UNAUTHORIZED` / `403 FORBIDDEN`: sin autenticación o sin permisos.
- `409 TENANT_SLUG_ALREADY_EXISTS`: slug en uso.

> **Decisión a cerrar en implementación:** si el alta de comercio en registro debe crear tenant automáticamente o seleccionar uno existente. El contrato de `register` ya contempla `tenantId` para comercio; `POST /api/tenants` soporta el alta previa/administrativa del comercio.

---

## 5. Plan de refactorización en el Frontend (Angular 22 + Ionic 9)

### 5.1 Estado actual (a migrar)
- `AuthService`: síncrono, persiste sesión/perfiles en `localStorage` (`demo-storage.ts`), hash demo FNV-1a en cliente, `currentUser` como propiedad mutable.
- `roleGuard`: `CanActivateFn` síncrono que compara `auth.currentUser?.tipo`.
- `LoginPage`/`RegisterPage`: llaman métodos síncronos (`iniciarSesion`, `registrar`) y navegan según boolean.
- `main.ts`: sin `provideHttpClient`.
- Rutas protegidas: `/tabs` (`roleGuard('cliente')`) y `/comercio` (`roleGuard('comercio')`).

### 5.2 `AuthService` → `HttpClient` + `Signals` (estado reactivo de sesión)

**Objetivo:** convertir autenticación en flujo asíncrono contra API, con estado reactivo y persistencia segura del token.

**Cambios propuestos (archivo `src/app/services/auth.service.ts`, en bloque de implementación):**
- Inyectar `HttpClient`.
- Modelar estado con Signals:
  - `private readonly _currentUser = signal<AuthUser | null>(null);`
  - `private readonly _authStatus = signal<'unknown' | 'authenticated' | 'anonymous'>('unknown');` (o `loading` explícito) para hidratar sesión antes de decidir en guards.
  - `readonly currentUser = this._currentUser.asReadonly();`
  - `readonly isAuthenticated = computed(() => this._authStatus() === 'authenticated' && !!this._currentUser());`
  - `readonly role = computed(() => this._currentUser()?.role ?? null);`
- API pública (nueva, async):
  - `login(payload: { identifier: string; password: string; accountType: 'cliente'|'comercio' }): Observable<AuthSession>` (o `Promise`) → POST `/api/auth/register`? no, login a `/api/auth/login`.
  - `register(payload): Observable<AuthSession>` → POST `/api/auth/register`.
  - `me(): Observable<AuthSessionUser>` → GET `/api/auth/me`.
  - `logout(): Promise<void>` → limpia token + estado.
  - `restoreSession(): Promise<void>` → lee token de storage, si existe llama `me()` y setea estado; si falla/401 limpia.
- Mapear respuesta API → modelo frontend unificado:
  ```ts
  interface AuthUser { id: string; fullName: string; email: string; role: 'cliente'|'comercio'; tenantId: string; tenantSlug?: string; }
  ```
- **Compatibilidad temporal:** mantener adaptadores (p.ej. getters derivados `nombre`, `tipo`, `comercioId`) solo si es necesario para no romper plantillas en el mismo bloque; eliminar en limpieza posterior.
- Eliminar lógica de hash/perfiles demo y dependencia de `demo-storage` para auth una vez migrado (puede quedar para otros datos demo si aplica, pero no para sesión).

**Configuración HTTP:**
- En `src/main.ts` (o `app.config.ts` si se extrae): agregar `provideHttpClient(withInterceptors([authInterceptor]))`.
- Centralizar `environment.apiBaseUrl` (crear `src/environments/*` si no existe) para construir URLs (`${apiBaseUrl}/api/auth/login`).

### 5.3 `authInterceptor` (functional interceptor, Angular 22)

**Archivo nuevo propuesto:** `src/app/services/auth.interceptor.ts`

```ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { TokenStorageService } from './token-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenStorage = inject(TokenStorageService);
  // Solo adjuntar a API propia (evitar filtrar token a terceros)
  if (!req.url.includes('/api/')) return next(req);

  return from(tokenStorage.getToken()).pipe(
    switchMap((token) => {
      if (!token) return next(req);
      return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
    })
  );
};
```

**Consideraciones:**
- No inyectar `AuthService` dentro del interceptor si provoca ciclo; preferir un `TokenStorageService`/`SessionStore` liviano.
- Manejo de `401` en respuestas: opcional en este bloque (logout + redirect a `/login` con `returnUrl`) vía interceptor de errores o en servicio; definir comportamiento consistente.
- No loguear headers/tokens.

### 5.4 Actualización de `roleGuard` (validar token/rol real sin romper navegación)

**Objetivo:** mantener `CanActivateFn` y rutas actuales (`/tabs` cliente, `/comercio` comercio) pero basar decisión en sesión real hidratada.

**Archivo:** `src/app/services/role.guard.ts`

**Comportamiento propuesto:**
- Si `authStatus === 'unknown'`, esperar `restoreSession()` (Promise/Observable) antes de decidir (evitar redirect falso en refresh/app start).
- Si no autenticado → `router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })` (igual que hoy).
- Si autenticado pero rol no coincide → redirigir a home del rol real **o** a `/login` según política; para evitar bucles y confusión, recomendado: `UrlTree` a `homePorRol()` del usuario actual (y opcional toast) manteniendo seguridad UX.
- Si autenticado y rol coincide → `true`.

**Firma:** puede seguir siendo `CanActivateFn` retornando `boolean | UrlTree | Observable<boolean|UrlTree> | Promise<...>` (Angular soporta async guards). No cambiar paths ni `canActivate` en `app.routes.ts`.

### 5.5 Almacenamiento seguro del token en móvil (`@capacitor/preferences`)

**Dependencia:** ya instalada (`@capacitor/preferences` en `package.json`).

**Archivo nuevo propuesto:** `src/app/services/token-storage.service.ts`
- API: `setToken(token: string): Promise<void>`, `getToken(): Promise<string | null>`, `clear(): Promise<void>`.
- Claves: p.ej. `snacki.auth.access_token` (y opcional metadata no sensible como expiración).
- Implementación: `Preferences.set/get/remove` de `@capacitor/preferences` (funciona en web y nativo; en web usa almacenamiento del plugin, evitando depender de `localStorage` directo para el token).
- **No almacenar** contraseña ni datos sensibles adicionales; solo token(s) necesarios.
- Migración: al iniciar versión nueva, si existe sesión demo legacy en `localStorage` (`snacki.current-user`), forzar logout limpio y pedir login real (no migrar hashes demo).

### 5.6 Cambios en Login/Register (UI y flujo)
- `LoginPage`:
  - Cambiar `iniciarSesion()` a async con manejo de `loading` real (deshabilitar botón/spinner) y errores por código HTTP (`401/403/400`).
  - Llamar `auth.login(...)` (Observable/Promise), en éxito navegar a `destinoSeguro()`/`homePorRol()` según respuesta real.
  - Mantener validación de `returnUrl` segura (`/` único, no `//`).
  - Decisión UX: campo "usuario o correo" → preferir **email** para MVP backend; si se mantiene texto libre, backend debe definir resolución y el mensaje de error seguir siendo genérico.
- `RegisterPage`:
  - `registrar()` async → `auth.register(...)`.
  - `comercioId` del formulario (hoy id local de `StoreService`) deberá mapear a `tenantId` real (uuid) obtenido de backend (catálogo de tenants o flujo de alta). **Bloque de integración:** definir fuente de tenants (endpoint `GET /api/tenants` público/listado o precargado) antes de conectar registro comercio end-to-end.
  - Manejar `409 EMAIL_ALREADY_EXISTS` con mensaje claro.
- Mantener estilos/estructura visual salvo ajustes mínimos de estado de carga/errores.

### 5.7 Limpieza y compatibilidad
- Retirar uso de `demo-storage` para autenticación; evaluar si otros servicios demo siguen necesitándolo.
- Actualizar/añadir pruebas (`auth.service.spec.ts`, `role.guard.spec.ts`, specs de páginas) para mocks de `HttpClientTestingModule`/`provideHttpClientTesting` y `Preferences`.
- No introducir cambios de `.scss`/`.ts` en esta fase de planificación (solo este documento y la rama).

---

## 6. Checklist paso a paso de ejecución (ordenado, sin romper flujo)

> Ejecutar bloque por bloque, con commit por bloque y verificación antes de continuar. Mantener la app funcional en cada hito (feature flag o convivencia temporal si es necesario).

### Bloque 0 — Preparación (repo y alineación)
- [ ] **B0.1** Confirmar baseline integrado: `develop` actualizado (`git fetch`, comparar con `origin/develop`) y rama de trabajo creada desde `develop` (`feat/backend-auth-base`). *Estado: rama creada localmente desde `develop`.*
- [ ] **B0.2** Acordar decisiones abiertas: login por `email` vs `identifier`, política de expiración JWT, origen de `tenantId` para registro de comercio, y si `POST /api/tenants` es admin-only en MVP.
- [ ] **B0.3** Definir variables de entorno y puertos (`api`, `postgres`) y añadir `backend/.env.example` (sin secretos reales).

### Bloque 1 — Esqueleto backend y base de datos
- [ ] **B1.1** Crear carpeta `backend/` con estructura propuesta, `package.json`, `tsconfig`, lint/format básicos.
- [ ] **B1.2** Añadir `docker-compose.yml` (Postgres) y `Dockerfile` del API; verificar `docker compose up` levanta DB.
- [ ] **B1.3** Configurar Prisma (`schema.prisma`), conexión `DATABASE_URL`, y generar cliente.
- [ ] **B1.4** Crear migración inicial (`users`, `tenants`, `user_tenant_roles`, enum rol, índices/uniques).
- [ ] **B1.5** (Opcional MVP) Seed de tenant plataforma (`snacki`) y tenant(s) comercio de prueba para desarrollo.

### Bloque 2 — Núcleo de seguridad y utilidades backend
- [ ] **B2.1** Implementar `password` helper (hash/verify con argon2 o bcrypt) y pruebas unitarias.
- [ ] **B2.2** Implementar `jwt` helper (sign/verify) y tipado de payload (`sub`, `email`, `role`, `tenantId`, `exp`).
- [ ] **B2.3** Implementar manejo de errores consistente (`AppError`, error handler) y envelope de respuesta.
- [ ] **B2.4** Configurar CORS para origen(es) del frontend (dev/prod).

### Bloque 3 — Endpoints de autenticación y tenants
- [ ] **B3.1** `POST /api/auth/register`: validación, unicidad email, creación user + membership + tenant resolution, retorno `201` con `user/membership/auth`.
- [ ] **B3.2** `POST /api/auth/login`: verificación credenciales, validación de `accountType` vs membership, retorno `200` con JWT.
- [ ] **B3.3** Plugin/middleware `authenticate` (Bearer JWT) y `GET /api/auth/me`.
- [ ] **B3.4** `POST /api/tenants`: validación, unicidad slug, protección por auth/autorización definida.
- [ ] **B3.5** Pruebas de integración de los 4 contratos (happy path + errores 400/401/403/404/409).

### Bloque 4 — Preparación frontend (infra HTTP y storage)
- [ ] **B4.1** Añadir configuración de `apiBaseUrl` (environments) y `provideHttpClient(withInterceptors([authInterceptor]))` en `main.ts`.
- [ ] **B4.2** Crear `TokenStorageService` con `@capacitor/preferences` (`get/set/clear`) y pruebas básicas.
- [ ] **B4.3** Crear modelos/tipos frontend (`AuthUser`, `AuthSession`, `ApiError`) alineados al contrato.
- [ ] **B4.4** Implementar `authInterceptor` funcional (adjuntar Bearer solo a `/api/`) y manejo base de `401` (definir estrategia).

### Bloque 5 — Migración AuthService y guards
- [ ] **B5.1** Refactorizar `AuthService` a `HttpClient + Signals` (`login`, `register`, `me`, `logout`, `restoreSession`, estado `unknown/authenticated/anonymous`).
- [ ] **B5.2** Implementar hidratación de sesión al arranque (APP_INITIALIZER o llamada controlada en bootstrap/guard) usando token en Preferences + `GET /api/auth/me`.
- [ ] **B5.3** Actualizar `roleGuard` a guard async que espere hidratación y valide rol real; preservar rutas `/tabs` y `/comercio` y `returnUrl` seguro.
- [ ] **B5.4** Ajustar `app.routes.ts` solo si es estrictamente necesario (idealmente sin cambios de paths/guards).

### Bloque 6 — Integración UI Login/Register
- [ ] **B6.1** Adaptar `LoginPage` a flujo async (loading, errores por API, navegación por rol/returnUrl).
- [ ] **B6.2** Adaptar `RegisterPage` a flujo async y mapeo correcto de `tenantId` para comercios (según decisión B0.2).
- [ ] **B6.3** Eliminar dependencia de auth demo (`localStorage` perfiles/sesión, hash cliente) y gestionar migración de sesión legacy (logout forzado).
- [ ] **B6.4** Verificación manual E2E: registro cliente, login cliente, refresh conserva sesión, acceso `/tabs`; registro/login comercio, acceso `/comercio`; intento de cruce de rol bloqueado/redirigido correctamente.

### Bloque 7 — Calidad, seguridad y cierre
- [ ] **B7.1** Ejecutar lint/typecheck/tests frontend y backend; corregir regresiones.
- [ ] **B7.2** Revisar que no se registren tokens/contraseñas/PII en logs (front/back) y que errores al cliente sean genéricos donde corresponda.
- [ ] **B7.3** Documentar en README (o doc específico) cómo levantar backend+DB con Docker y configurar `apiBaseUrl` del frontend.
- [ ] **B7.4** PR/revisión: validar contratos, aislamiento tenant, y que no se rompió navegación existente.

---

## 7. Riesgos y dependencias a vigilar
- **Desfase de IDs:** `StoreService` usa ids locales; registro de comercio debe alinearse a `tenantId` real antes de habilitar flujo comercio productivo.
- **Hidratación de sesión:** sin estado `unknown`/espera, el guard puede redirigir en cold start aunque haya token válido.
- **Múltiples memberships futuras:** el modelo soporta varios tenants por usuario; el MVP debe definir membership activa y claim `tenantId/role` en JWT.
- **CORS y cookies:** si en el futuro se usan cookies/refresh, ajustar CORS/credentials; con Bearer en header no se requieren cookies para MVP.
- **Compatibilidad de tipos:** `SnackiUser` actual difiere del modelo real; planificar adaptación gradual de consumidores (`nombre/tipo/comercioId` → `fullName/role/tenantId`).

---

## 8. Criterios de aceptación del plan (para implementación posterior)
- Backend en `backend/` con TypeScript, Prisma/PostgreSQL y ejecución reproducible vía Docker.
- Esquema DB implementa `users`, `tenants`, `user_tenant_roles` con roles `cliente/comercio` y constraints de unicidad/aislamiento.
- Endpoints implementados y documentados según contratos: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/tenants`.
- Frontend usa `HttpClient + Signals`, `authInterceptor` funcional y `@capacitor/preferences` para token; `roleGuard` valida sesión/rol real manteniendo `/tabs` y `/comercio`.
- Flujo de login/registro/navegación existente preservado sin regresiones funcionales conocidas.
