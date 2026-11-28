# Plan de trabajo – Snacki (1 semana, 2 personas)

Equipo: **Persona A** (autor del plan) · **Persona B** (Bastian Herrera).

## 1. Qué es Snacki
Snacki es una **plataforma móvil multicomercio de marketing de recompensas y fidelización gastronómica** (heladerías, comida rápida, pizzerías, cafeterías). **No es app de pedidos ni de pagos**: la compra ocurre en el local y Snacki solo registra los puntos.

**No es regalar cosas.** Es una herramienta de marketing para el comercio con cuatro objetivos:

| Objetivo | Cómo lo logra Snacki |
|---|---|
| **Adquisición** | Clientes nuevos llegan por el mapa de comercios cercanos, las promos "lo nuevo" y los **referidos**. |
| **Prueba de productos nuevos** | **Solo los productos en promoción dan puntos** (ej. café nuevo = 250 pts), con vigencia definida por el comercio. |
| **Recompra frecuente** | Los puntos **vencen** en la fecha que fija el comercio → el cliente vuelve antes de perderlos. Progreso visible hacia la próxima recompensa + avisos push. |
| **Crecimiento por referidos** | Un cliente invita a otro con su código; ambos reciben bono cuando el invitado hace su **primera compra promocional válida** en ese comercio. |

Reglas de negocio:
- **Puntos aislados por comercio**: los puntos de un local **nunca se mezclan** con los de otro (saldo, canje, vencimiento y referidos son por comercio).
- Un producto da puntos solo si su promo está vigente (`promoStartsAt ≤ ahora ≤ promoEndsAt`, `isActive`).
- El bono de referido es un movimiento de puntos más (`REFERRAL_BONUS`) del mismo comercio y vence igual que los demás.

Roles:
- **Comercio**: crea promos (producto + puntos + vigencia), recompensas, fecha de vencimiento de puntos, reglas de referidos y ubicación del local; genera QR al vender una promo; envía notificaciones a sus clientes; ve estadísticas (incluidos referidos).
- **Cliente**: ve promos y comercios cercanos en un mapa, escanea QR (también sin conexión), ve saldo, progreso y vencimientos por comercio, comparte su código de referido y canjea recompensas.

## 2. Estado actual
| Hecho | Falta |
|---|---|
| Pantallas Ionic (login, registro, home, explorar, tienda, QR, puntos, perfil, comercio) | Conectar puntos/canje del cliente al backend (hoy simulados en `localStorage` / `store.service.ts`); el catálogo ya viene del backend |
| Auth contra backend (`/auth/*`, `/tenants`, JWT + interceptor) | Integrar `POST /api/claims` en la app del cliente |
| Esquema Prisma + seed de comercios gastronómicos (`feat/db-schema-seed`, PR #6) | Modelo `Referral` + reglas de bono en `Tenant` (`feat/referrals-engine`) |
| API comercio: promos, recompensas (con foto) y settings + panel comercio responsive con mapa del local (`feat/merchant-catalog`, PR #7) | Wallet, canjes, stats, referidos |
| Catálogo del cliente desde la API: `/catalog/*` (promos vigentes, recompensas, logo e imágenes; se refresca al entrar, al volver a la app y cada 60 s) (PR #10). Mapa interactivo (OpenStreetMap) para fijar la ubicación del local, mapa en la tienda y comercios cercanos ordenados por distancia en Explorar (`feat/geolocation-map`) | Build Android (APK) e informe final |
| QR firmado generado por el comercio + `POST /api/claims` atómico, una vez por QR (`feat/merchant-qr`) | |
| Deploy: API + Postgres en Railway y web en Firebase Hosting, automático al mergear a `develop` (`chore/deploy-railway`, PR #13) | |
| Escáner QR (`@capacitor-mlkit/barcode-scanning`); `@capacitor-community/sqlite` instalado sin usar | |

## 3. Arquitectura
```
App Ionic/Angular (Capacitor)
 ├─ SQLite local  ── caché de saldos/promos/recompensas/comercios + cola pending_ops
 ├─ SyncService   ── @capacitor/network: al volver la conexión envía la cola y refresca la caché
 ├─ Geolocation   ── @capacitor/geolocation → comercios cercanos en mapa (componente propio sobre teselas OpenStreetMap)
        │ HTTPS + JWT
Backend Fastify + Prisma (Railway) ── Postgres (Railway) = fuente de verdad
        └─ ClaimService     ── valida QR, acredita EARN y liquida referidos en la misma transacción

Web (build de Ionic en `www/`) ── Firebase Hosting; llama a la API de Railway (`assets/config.json`)
GitHub Actions (`deploy-develop.yml`) ── en cada merge a `develop`: lint + tests → Railway + Firebase Hosting
```

**Regla clave offline:** el celular **nunca decide saldos**. Sin conexión, el escaneo se guarda en SQLite como `PENDING` y se muestra **"puntos por confirmar"**. Al sincronizar, el servidor valida el QR (firma, un solo uso, vencimiento) y recién ahí acredita (y, si corresponde, liquida el bono de referido). Si el servidor lo rechaza, se marca `REJECTED` con el motivo. **Los canjes requieren conexión** (evita gastar puntos dos veces). Aplicar un código de referido también requiere conexión.

## 4. Modelo de datos (Postgres / Prisma)
- `Tenant` + `pointsExpireAt`, `category`, `address`, `latitude`, `longitude`, `logoUrl`.
  - **Reglas de referidos**: `referralEnabled` (bool), `referrerBonusPoints` (int), `refereeBonusPoints` (int), `referralMaxPerUser` (int, anti-abuso).
- `Product` = promo (tenantId, name, description, points, imageUrl, promoStartsAt, promoEndsAt, isActive). Solo se genera QR si la promo está vigente. **Solo estos productos dan puntos.**
- `Reward` (tenantId, name, cost, isActive).
- `PurchaseClaim` = el QR (id, tenantId, productId, quantity, points, expiresAt **24 h** para permitir sync offline, createdById, claimedById, claimedAt).
- `PointEntry` (userId, tenantId, type `EARN | REDEEM | REFERRAL_BONUS`, points, **remaining**, expiresAt, claimId, referralId, rewardId, createdAt).
  - Saldo (por comercio) = Σ `remaining` de `EARN` + `REFERRAL_BONUS` con `expiresAt > ahora`.
  - Canje descuenta FIFO (vence antes, se usa antes) en una transacción.
  - Unicidad: un `EARN` por `claimId`; un `REFERRAL_BONUS` por (`referralId`, `userId`).
- **`ReferralCode`** (userId, tenantId, code único corto) → cada cliente tiene un código **por comercio** (respeta el aislamiento de puntos).
- **`Referral`** (id, tenantId, referrerId, refereeId, code, status `PENDING | COMPLETED`, qualifyingClaimId, createdAt, completedAt).
  - Único por (`tenantId`, `refereeId`): un cliente solo puede ser referido una vez por comercio.
  - Se crea `PENDING` al aplicar el código; solo puede aplicarlo un cliente **sin movimientos previos** en ese comercio (adquisición real) y nunca el propio referente.
  - Pasa a `COMPLETED` con la **primera compra promocional válida** del referido en ese comercio: en la misma transacción del claim se crean dos `REFERRAL_BONUS` (referente y referido) con vencimiento `Tenant.pointsExpireAt`.
- `Redemption` (userId, tenantId, rewardId, code corto, status `PENDING | DELIVERED`).
- `DeviceToken` (userId, token FCM, platform, updatedAt).
- `Notification` (tenantId, title, body, productId opcional, sentAt, recipients).
- `UserTenant` (cliente que alguna vez sumó puntos en un comercio → audiencia de sus notificaciones).

## 5. SQLite local (app)
Tablas:
- `cache_wallet` (tenantId, balance, nextExpiresAt, nextExpiringPoints, updatedAt)
- `cache_tenants` (id, slug, name, category, lat, lng, logoUrl, updatedAt)
- `cache_promos` (id, tenantId, name, points, imageUrl, promoEndsAt)
- `cache_rewards` (id, tenantId, name, cost) → progreso hacia la próxima recompensa sin conexión
- `cache_movements` (id, tenantId, type, points, createdAt)
- `cache_referrals` (tenantId, code, pending, completed, bonusEarned)
- `pending_ops` (id local uuid, type `CLAIM`, payload = token QR, status `PENDING | SYNCED | REJECTED`, error, createdAt, attempts)

Sincronización (`SyncService`):
1. Detecta conexión con `@capacitor/network`.
2. Envía `pending_ops` a `POST /api/sync/claims` (lote; idempotente por `claimId`).
3. Marca cada op `SYNCED` o `REJECTED` según respuesta (con motivo legible: ya usado, vencido, promo inactiva).
4. Refresca caché con `GET /api/wallet`, `/api/promos`, `/api/tenants/nearby`, `/api/referrals/me`.
5. En web (navegador) usar `jeep-sqlite` (fallback a memoria) para la demo en navegador.

## 6. API
**Comercio** (rol `comercio`, solo su tenant)
- `GET/POST/PATCH/DELETE /api/merchant/products` (acepta `imageUrl`: foto PNG/JPG/WebP como data URL, URL o ruta de assets; si la promo ya tiene ventas se archiva en vez de borrarse) (hecho)
- `GET/POST/PATCH/DELETE /api/merchant/rewards` (igual, con `imageUrl`; se archiva si ya tiene canjes) (hecho)
- **Sucursales y aprobaciones** ✅: el registro de comercio tiene dos pestañas. *Local nuevo* crea el comercio y deja la cuenta como **titular** (`staffRole = owner`); *Sucursal* se une a un comercio existente como **asistente** (`assistant`). Cuando un asistente crea, edita o elimina una promo o recompensa, el API no lo aplica: guarda un `ChangeRequest` (datos ya validados) y responde `202 {pending: true}`. Los titulares lo revisan en `GET /api/merchant/change-requests` y lo resuelven con `POST /change-requests/:id/approve` (aplica el cambio una sola vez) o `/reject` (motivo opcional); el asistente ve solo sus solicitudes. Los asistentes tampoco pueden editar los settings del local (`403 OWNER_ONLY`). Pendiente de definir: notificar al asistente cuando se resuelve y poder cancelar una solicitud propia.
- `PATCH /api/merchant/settings` (`pointsExpireAt`, dirección, lat/lng, categoría, logo, **reglas de referidos**) (hecho, incluye reglas de referidos: `referralEnabled`, `referrerBonusPoints`, `refereeBonusPoints`, `referralMaxPerUser`; no se puede activar sin al menos un bono)
- `POST /api/merchant/qr` `{productId, quantity}` → `{claimId, token, qrContent, expiresAt, points}` (token compacto `S1.<claimId>.<exp>.<HMAC-SHA256>` firmado con `QR_SECRET`; el QR codifica `snacki://claim/<token>` con el logo de Snacki al centro) (hecho)
- `GET /api/merchant/qr/:id` → `pending | claimed | expired` (la pantalla del QR muestra "escaneado") (hecho)
- `POST /api/merchant/qr/:id/void` → anula un QR no canjeado (venta cancelada) (hecho)
- `GET /api/merchant/redemptions?limit&before` → canjes del local (recompensa, cliente, código, puntos), paginados por cursor (hecho). No hay "marcar entregado": con el canje por QR el `Redemption` nace `DELIVERED` frente al comercio.
- `GET /api/merchant/stats?range=7d|30d|90d|all` → puntos emitidos, canjes, clientes únicos, clientes recurrentes (2+ compras), promo más escaneada y **referidos** (pendientes, completados, clientes nuevos por referido, bono emitido, conversión) (hecho; pestaña "Estadísticas" del panel comercio)
- `POST /api/merchant/notifications` `{title, body, productId?}` → push a sus clientes · `GET` historial

**Cliente**
- `GET /api/catalog/tenants` ✅ (comercios activos con promos vigentes y recompensas activas; requiere sesión)
- `GET /api/catalog/images/:kind/:id` ✅ (`kind` = `tenant|product|reward`; sirve las fotos subidas por el comercio, pública y cacheable)
- `GET /api/promos?category=&lat=&lng=` (promos vigentes, "lo nuevo")
- `GET /api/tenants/nearby?lat=&lng=&radiusKm=` (comercios adheridos con distancia)
- `GET /api/tenants/:slug` (promos vigentes + recompensas + si tiene referidos activos)
- `POST /api/claims` `{token}` → acredita una vez (`UPDATE ... WHERE claimedAt IS NULL` en transacción + `point_entries.claim_id` único); `400` QR inválido, `403` QR propio, `409` ya usado, `410` vencido/anulado. ✅ (integrado en la app del cliente)
  - **Integración referidos**: si existe un `Referral PENDING` del usuario en ese tenant y es su primera compra promocional válida, en la **misma transacción** se marca `COMPLETED` y se liquidan los `REFERRAL_BONUS`. Respuesta incluye `referralBonus` si aplicó. ✅ (si el comercio apagó los referidos, el pendiente espera sin pagar)
- `POST /api/sync/claims` `{ops:[{localId, token}]}` → resultado por op (usa el mismo `ClaimService`, por lo que también liquida referidos)
- `GET /api/wallet` ✅ (saldo, próximo vencimiento y progreso a la siguiente recompensa por comercio) · `GET /api/wallet/movements` · `GET /api/wallet/:tenantId/movements` ✅
- **Canje solo con QR del comercio** ✅: el comercio genera `POST /api/merchant/redeem-qr` `{rewardId}` (token `R1`, `snacki://redeem/…`, 10 min, un solo uso; `GET /redeem-qr/:id` muestra a quién entregar y el código; `POST /redeem-qr/:id/void`). El cliente escanea → `POST /api/redemptions/preview` `{token}` (recompensa, costo, saldo) → confirma → `POST /api/redemptions` `{token}`: bloquea sus puntos (`FOR UPDATE`), descuenta FIFO por vencimiento y crea el `Redemption` entregado, todo en una transacción. `409 INSUFFICIENT_POINTS` no toca nada; `409` ya usado; `410` vencido/anulado o recompensa no disponible. No existe canje sin QR.
- **`POST /api/referrals/apply`** `{code}` → crea `Referral PENDING`; errores: `404 REFERRAL_CODE_INVALID`, `409 REFERRAL_SELF`, `REFERRAL_MUTUAL` (código de alguien a quien invitaste), `REFERRAL_EXISTING_CLIENT`, `REFERRAL_ALREADY_REFERRED`, `REFERRALS_DISABLED`, `REFERRAL_LIMIT_REACHED` ✅
- **`GET /api/referrals/me`** → por comercio con referidos activos: mi código (7 caracteres, se crea al consultar), bonos, `pending`, `completed`, `remainingInvites`, `bonusEarned` y `referredBy` (si llegué invitado) ✅
- `GET /api/catalog/tenants` incluye `referral: {enabled, referrerBonusPoints, refereeBonusPoints}` por comercio ✅
- `POST /api/devices` `{token, platform}` (registrar token push)

## 7. Plugins y librerías
| Uso | Paquete |
|---|---|
| SQLite | `@capacitor-community/sqlite` (ya instalado) + `jeep-sqlite` para web |
| Conexión | `@capacitor/network` |
| Ubicación | `@capacitor/geolocation` |
| Mapa | Componente propio `app-snacki-map` + teselas OpenStreetMap (gratis, sin API key ni dependencias) |
| Deploy | Railway (API + Postgres) · Firebase Hosting (web) · GitHub Actions |
| Generar QR | `qrcode` |
| Escanear QR | `@capacitor-mlkit/barcode-scanning` (ya instalado) |
| Compartir código de referido | `@capacitor/share` (opcional; fallback copiar al portapapeles) |

Permisos Android: ubicación, cámara, notificaciones (Android 13+). `google-services.json` y `.env` **no se suben al repo**; se comparten por fuera.

## 8. Ramas y responsables
Todas salen de `develop` y vuelven por PR a `develop` (revisa la otra persona). Al final, `develop` → `main` para la entrega.

| Rama | Responsable | Objetivo / terminado cuando… | Estado |
|---|---|---|---|
| `feature/base-architecture` | A | Estructura base Ionic/Angular, rutas y servicios | Hecho (PR #1, #9) |
| `feature/figma-ui-screens-bastian` | B | Pantallas del cliente según el diseño de Figma | Hecho (PR #2) |
| `feature/branding-login-ui` | A | Branding Snacki y UI de login/registro | Hecho (PR #3) |
| `codex/qr-scanner-loyalty-flow` | A | Escáner QR (`@capacitor-mlkit/barcode-scanning`) y flujo de fidelización | Hecho (PR #4) |
| `feat/backend-auth-base` | A | Backend base: `/auth/*`, `/tenants`, JWT + interceptor | Hecho (PR #5) |
| `feat/db-schema-seed` | A + B | Migración Prisma con los modelos de §4 + seed (4 comercios con coordenadas, promos, recompensas; usuarios demo) | Hecho (PR #6) |
| `feat/merchant-catalog` | A | CRUD promos y recompensas + settings (back + panel comercio) | Hecho (PR #7) |
| `fix/login-logout-fotos-catalogo` | B | Arreglos de login/logout, fotos y catálogo del cliente desde `/catalog/*` | Hecho (PR #10) |
| `feat/merchant-qr` | A | Comercio genera QR de una promo vigente y lo muestra en pantalla | Hecho (PR #12) |
| `chore/deploy-railway` | B | API + Postgres en **Railway** (`/health` responde; variables `JWT_SECRET`, `QR_SECRET`, `DATABASE_URL`, `CORS_ORIGIN`) y web en **Firebase Hosting** (`firebase.json`, `.firebaserc`); workflow `deploy-develop.yml` que en cada merge a `develop` corre lint + tests, redespliega el backend en Railway y publica `www/` en Firebase | Hecho (PR #13) |
| `feat/client-claims-wallet` | B | Escanear → `POST /claims` → saldo; wallet por comercio con progreso a recompensa y vencimientos; movimientos; canje de recompensas solo con QR del comercio | Hecho (PR #14) |
| `feat/branch-approvals` | A | Registro con pestañas (local nuevo / sucursal), rol titular-asistente y aprobación de cambios de promos y recompensas | Hecho (PR #16) |
| `feat/referrals-engine` | A | `ReferralCode` + `Referral` + reglas en `Tenant`; `POST /referrals/apply`, `GET /referrals/me`; liquidación `REFERRAL_BONUS` en `ClaimService`; ajustes en el panel y pantalla "Invita y gana" en el cliente | Hecho (PR #17) |
| `feat/merchant-redemptions-stats` | A | Lista de canjes y estadísticas por período con métricas de recompra y referidos (entrega inmediata vía QR de canje) | Hecho (PR #18) |
| `feat/geolocation-map` + `fix/geolocation-map` | A | Mapa de comercios cercanos en Explorar (orden por distancia), ubicación del local elegible en el mapa y mapa en la tienda con "Cómo llegar" | Hecho (PR #15 + PR #19) |
| `chore/android-build` | B | `android/` versionado, permisos de cámara y ubicación, CORS para `https://localhost`, scripts `android:sync` / `android:apk` y APK de debug apuntando a Railway | Hecho |
| `docs/informe-final` | A + B | Informe, diagramas, README actualizado (deploy en Railway + Firebase Hosting, secrets de GitHub Actions), guion de demo | Pendiente (última) |

## 9. Arreglos y pulido
Sin rama propia: lo que quede pendiente se resuelve dentro de `chore/android-build` al probar el APK.

**Limpieza de datos simulados**
- Retirar datos simulados/residuales de `localStorage` y de `store.service.ts` (saldos, catálogo, canjes de demo); todo sale de la API o de la caché SQLite.
- Borrar claves viejas de `localStorage` al iniciar la app (migración única) para que no aparezcan saldos fantasma.

**Mensaje comercial explícito en la UI**
- Texto visible: "La compra se hace en el local. Snacki solo suma tus puntos."
- Insignia **"Da X pts"** solo en productos en promoción, con "Promo válida hasta dd/mm".
- Cada saldo muestra el **comercio dueño** (logo + nombre) y "Estos puntos solo sirven en {comercio}".
- Fecha de vencimiento visible: "120 pts vencen el dd/mm"; progreso: "Te faltan 150 pts para {recompensa}".
- Pantalla "Invita y gana" por comercio: código, cómo funciona el bono y estado de mis referidos.

**Estados vacíos (*empty states*)**
- Sin puntos en ningún comercio, comercio sin promos vigentes, sin recompensas, sin movimientos, sin comercios cercanos / ubicación denegada, sin referidos, panel comercio sin promos ni canjes.

**Mensajes de error claros**
- `409` → "Este QR ya fue usado."
- `410` → "Este QR venció. Pide uno nuevo en el local."
- Saldo insuficiente → "Te faltan X pts para esta recompensa."
- Sin red al canjear → "Necesitas conexión para canjear. Tus puntos siguen a salvo."
- Claim offline rechazado al sincronizar → motivo visible en el movimiento.
- Errores de referido (código inválido, ya eres cliente, ya usaste un código).

**Carga y anti-doble clic**
- `ion-spinner` / skeletons al cargar; botones de canjear, generar QR, aplicar código y enviar notificación quedan deshabilitados mientras la petición está en curso.
- El escáner ignora lecturas repetidas del mismo token en la misma sesión.

**Estética**
- Minimalista: blanco, negro y **azul eléctrico** como único color de acento (variables `--ion-color-primary`); componentes nativos de Ionic, sin librerías de UI extra; tipografía y espaciados consistentes.

**Higiene del repositorio**
- `.env`, `google-services.json`, `node_modules/` y carpetas de build (`dist/`, `www/`, `.angular/`, `android/app/build/`) fuera de Git; agregar `google-services.json` al `.gitignore` y verificar con `git ls-files`.
- `android/` se versiona (sin `build/`, `local.properties`, assets generados ni `google-services.json`) para conservar permisos y configuración.
- `.env.example` actualizado en front y backend.

## 10. Cronograma
| Día | Persona A (Comercio + referidos + mapa + push) | Persona B · Bastian (Cliente + offline + infra) |
|---|---|---|
| 1 | Hecho. Juntos: `feat/db-schema-seed`, contrato API (§6) | Hecho. Juntos + inicio `chore/deploy-railway` |
| 2 | Hecho: `feat/merchant-catalog`. Siguiente: `feat/merchant-qr` | `chore/deploy-railway` + `feat/client-claims-wallet` backend + tests (doble escaneo, vencido) |
| 3 | Hecho: `feat/merchant-qr` + `feat/referrals-engine` backend | Hecho: `chore/deploy-railway` + `feat/client-claims-wallet` |
| 4 | Hecho: `feat/referrals-engine` front + `feat/branch-approvals` + `feat/merchant-redemptions-stats` | Hecho: `feat/client-claims-wallet` front (progreso, vencimientos, canje con QR) |
| 5 | Hecho: `feat/geolocation-map` + `fix/geolocation-map` | Integración E2E en celular contra Railway |
| 6 | Integración E2E en celular contra Railway | `chore/android-build` (APK apuntando a Railway) |
| 7 | `docs/informe-final` | `docs/informe-final` + guion de demo |

**Si el tiempo no alcanza**, recortar en este orden: aviso automático de vencimiento → historial de notificaciones → stats detalladas (dejar solo totales y referidos completados) → filtro por categoría → radio configurable del mapa → compartir con `@capacitor/share` (dejar copiar código).
**No recortar**: QR firmado, puntos en backend, aislamiento por comercio, liquidación del bono de referido, offline básico, mensajes de error de §9.

## 11. Criterio de "terminado" (demo)
1. Comercio crea promo "café nuevo, 250 pts, válida hasta dd/mm" → aparece en Home del cliente con insignia "Da 250 pts"; productos sin promo no muestran puntos.
2. Comercio envía notificación "¡Nuevo café!" → llega al celular del cliente.
3. Cliente ve el comercio en el mapa de comercios cercanos.
4. Comercio genera QR → cliente lo escanea → saldo de **ese comercio** sube; el saldo de otro comercio no cambia.
5. Mismo QR escaneado de nuevo → "Este QR ya fue usado" (`409`); QR vencido → `410`.
6. En modo avión el cliente escanea → queda "por confirmar" → al volver la conexión se acredita.
7. **Referidos**: cliente A comparte su código → cliente B (nuevo en el comercio) lo aplica → queda `PENDING` → B hace su primera compra promocional → ambos reciben `REFERRAL_BONUS` una sola vez → el comercio ve el referido completado en stats. Auto-referido y cliente existente son rechazados.
8. Wallet muestra progreso hacia la próxima recompensa y la fecha de vencimiento; puntos vencidos no cuentan en el saldo.
9. Cliente canjea recompensa → comercio ve el código y lo marca entregado; sin red el canje se bloquea con mensaje claro.
10. Sin datos simulados en `localStorage`; empty states y errores de §9 visibles; botones sin doble envío.
11. Todo corre contra el backend en Railway, en APK Android; `.env` y `google-services.json` no están en Git.

## 12. Fuera de alcance
Pedidos, pagos, iOS, niveles/gamificación, recuperación de contraseña, canjes sin conexión.
