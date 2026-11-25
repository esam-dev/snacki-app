# Plan de trabajo – Snacki (1 semana, 2 personas)

## 1. Qué es Snacki
Wallet de puntos multicomercio para negocios de comida (heladerías, comida rápida, pizzerías, cafeterías). **No es app de pedidos ni de pagos**: la compra ocurre en el local.

Objetivo: que el negocio **dé a conocer rápido sus productos nuevos**. Solo los productos en promoción dan puntos. El cliente los acumula por comercio y los canjea por recompensas antes de la fecha de vencimiento que fija el comercio.

- **Comercio**: crea productos promocionales (ej. café nuevo = 250 pts) con vigencia, recompensas, fecha de vencimiento de puntos, ubicación del local; genera QR al vender una promo; envía notificaciones a sus clientes.
- **Cliente**: ve promos y comercios cercanos en un mapa, escanea QR (también sin conexión), ve saldo por comercio y canjea recompensas.
- Los puntos **no se comparten entre comercios**.

## 2. Estado actual
| Hecho | Falta |
|---|---|
| Pantallas Ionic (login, registro, home, explorar, tienda, QR, puntos, perfil, comercio) | Conectar puntos/canje al backend (hoy en `localStorage`, `store.service.ts`); el catálogo ya viene del backend |
| Escáner QR (`@capacitor-mlkit/barcode-scanning`) | QR firmado generado por el comercio |
| Backend Fastify + Prisma + Postgres: `/auth/*`, `/tenants`, `/merchant/*` (promos, recompensas y ajustes, con foto), `/catalog/*` (catálogo e imágenes para el cliente) | QR, puntos, canjes, stats, geolocalización, notificaciones |
| Front usa la API para auth, panel del comercio (con subida de fotos) y catálogo del cliente (promos vigentes, recompensas, logo; se refresca al entrar, al volver a la app y cada 60 s); `@capacitor-community/sqlite` instalado sin usar | SQLite offline + sincronización, mapa, push, Railway, Android, informe |

## 3. Arquitectura
```
App Ionic/Angular (Capacitor)
 ├─ SQLite local  ── caché de saldos/promos/comercios + cola de operaciones pendientes
 ├─ SyncService   ── al volver la conexión envía la cola y refresca la caché
 ├─ Geolocation   ── ubicación del cliente → comercios cercanos en mapa (Leaflet + OpenStreetMap)
 └─ Push          ── recibe notificaciones (Firebase Cloud Messaging)
        │ HTTPS + JWT
Backend Fastify (Railway) ── Postgres (Railway) = fuente de verdad
        └─ firebase-admin para enviar push
```

**Regla clave offline:** el celular **nunca decide saldos**. Sin conexión, el escaneo se guarda en SQLite como *pendiente* y se muestra "puntos por confirmar". Al sincronizar, el servidor valida el QR (firma, un solo uso, vencimiento) y recién ahí acredita. Si el servidor lo rechaza, se marca como rechazado en la app. **Los canjes requieren conexión** (evita gastar puntos dos veces).

## 4. Modelo de datos (Postgres / Prisma)
- `Tenant` + `pointsExpireAt`, `category`, `address`, `latitude`, `longitude`, `logoUrl`.
- `Product` = promo (tenantId, name, description, points, imageUrl, promoStartsAt, promoEndsAt, isActive). Solo se genera QR si la promo está vigente.
- `Reward` (tenantId, name, cost, isActive).
- `PurchaseClaim` = el QR (id, tenantId, productId, quantity, points, expiresAt **24 h** para permitir sync offline, createdById, claimedById, claimedAt).
- `PointEntry` (userId, tenantId, type `EARN|REDEEM`, points, **remaining**, expiresAt, claimId único, rewardId, createdAt).
  - Saldo = Σ `remaining` de EARN con `expiresAt > ahora`.
  - Canje descuenta FIFO (vence antes, se usa antes) en una transacción.
- `Redemption` (userId, tenantId, rewardId, code corto, status `PENDING|DELIVERED`).
- `DeviceToken` (userId, token FCM, platform, updatedAt).
- `Notification` (tenantId, title, body, productId opcional, sentAt, recipients).
- `UserTenant` (cliente que alguna vez sumó puntos en un comercio → audiencia de sus notificaciones).

## 5. SQLite local (app)
Tablas:
- `cache_wallet` (tenantId, balance, nextExpiresAt, updatedAt)
- `cache_tenants` (id, slug, name, category, lat, lng, logoUrl, updatedAt)
- `cache_promos` (id, tenantId, name, points, imageUrl, promoEndsAt)
- `cache_movements` (id, tenantId, type, points, createdAt)
- `pending_ops` (id local uuid, type `CLAIM`, payload = token QR, status `PENDING|SYNCED|REJECTED`, error, createdAt, attempts)

Sincronización (`SyncService`):
1. Detecta conexión con `@capacitor/network`.
2. Envía `pending_ops` a `POST /api/sync/claims` (lote; idempotente por `claimId`).
3. Marca cada op `SYNCED` o `REJECTED` según respuesta.
4. Refresca caché con `GET /api/wallet`, `/api/promos`, `/api/tenants/nearby`.
5. En web (navegador) usar `jeep-sqlite` o fallback a memoria, para la demo en navegador.

## 6. API
**Comercio** (rol `comercio`, solo su tenant)
- `GET/POST/PATCH/DELETE /api/merchant/products` (acepta `imageUrl`: foto PNG/JPG como data URL, URL o ruta de assets)
- `GET/POST/PATCH/DELETE /api/merchant/rewards` (igual, con `imageUrl`)
- `PATCH /api/merchant/settings` (`pointsExpireAt`, dirección, lat/lng, categoría, logo)
- `POST /api/merchant/qr` `{productId, quantity}` → `{token, expiresAt}` (JWT con `QR_SECRET`, contiene solo `claimId`)
- `GET /api/merchant/redemptions` · `PATCH /api/merchant/redemptions/:id/deliver`
- `GET /api/merchant/stats` (puntos emitidos, canjes, clientes únicos, promo más escaneada)
- `POST /api/merchant/notifications` `{title, body, productId?}` → envía push a sus clientes · `GET` historial

**Cliente**
- `GET /api/catalog/tenants` ✅ (comercios activos con promos vigentes y recompensas activas; requiere sesión)
- `GET /api/catalog/images/:kind/:id` ✅ (`kind` = `tenant|product|reward`; sirve las fotos subidas por el comercio, pública y cacheable)
- `GET /api/promos?category=&lat=&lng=` (promos vigentes, "lo nuevo")
- `GET /api/tenants/nearby?lat=&lng=&radiusKm=` (comercios adheridos con distancia)
- `GET /api/tenants/:slug` (promos vigentes + recompensas)
- `POST /api/claims` `{token}` → acredita una vez (`UPDATE ... WHERE claimedAt IS NULL`); 409 ya usado, 410 vencido
- `POST /api/sync/claims` `{ops:[{localId, token}]}` → resultado por op
- `GET /api/wallet` · `GET /api/wallet/:tenantId/movements`
- `POST /api/redemptions` `{rewardId}` → devuelve código para mostrar en caja
- `POST /api/devices` `{token, platform}` (registrar token push)

## 7. Plugins y librerías
| Uso | Paquete |
|---|---|
| SQLite | `@capacitor-community/sqlite` (ya instalado) + `jeep-sqlite` para web |
| Conexión | `@capacitor/network` |
| Ubicación | `@capacitor/geolocation` |
| Mapa | `leaflet` + OpenStreetMap (gratis, sin API key) |
| Push | `@capacitor/push-notifications` + Firebase (FCM); backend `firebase-admin` |
| Generar QR | `qrcode` |
| Escanear QR | `@capacitor-mlkit/barcode-scanning` (ya instalado) |

Permisos Android: ubicación, cámara, notificaciones (Android 13+). `google-services.json` **no se sube al repo** si contiene datos sensibles; compartirlo por fuera.

## 8. Ramas y responsables
Todas salen de `develop` y vuelven por PR a `develop` (revisa la otra persona). Al final, `develop` → `main` para la entrega.

| Rama | Responsable | Objetivo / terminado cuando… |
|---|---|---|
| `feat/db-schema-seed` | A + B (día 1) | Migración Prisma con todos los modelos de §4 + seed (4 comercios: heladería, comida rápida, pizzería, café, con coordenadas, promos y recompensas; usuarios demo) |
| `chore/deploy-railway` | B | API + Postgres en Railway, `/health` responde, variables `JWT_SECRET`, `QR_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, Firebase |
| `feat/merchant-catalog` | A | CRUD promos y recompensas + settings (back + front en panel comercio) |
| `feat/merchant-qr` | A | Comercio genera QR de una promo vigente y lo muestra en pantalla |
| `feat/merchant-redemptions-stats` | A | Lista de canjes, marcar entregado, estadísticas |
| `feat/push-notifications` | A | Registro de token, panel para enviar notificación, cliente la recibe en Android |
| `feat/client-claims-wallet` | B | Escanear → `POST /claims` → saldo; wallet con vencimientos; movimientos |
| `feat/client-redemptions` | B | Canjear recompensa con código; errores de saldo insuficiente |
| `feat/offline-sqlite-sync` | B | SQLite local, cola `pending_ops`, `SyncService`, indicador "sin conexión / por confirmar" |
| `feat/geolocation-map` | A | Settings con ubicación del local + mapa de comercios cercanos en Explorar |
| `chore/android-build` | B | `npx cap add android`, permisos, APK apuntando a Railway |
| `docs/informe-final` | A + B | Informe, diagramas, README actualizado, guion de demo |

## 9. Cronograma
| Día | Persona A (Comercio + mapa + push) | Persona B (Cliente + offline + infra) |
|---|---|---|
| 1 | Juntos: `feat/db-schema-seed`, acordar contrato API (§6) | Juntos + `chore/deploy-railway` |
| 2 | `feat/merchant-catalog` (back + front) | `feat/client-claims-wallet` backend + tests (doble escaneo, vencido) |
| 3 | `feat/merchant-qr` + `feat/merchant-redemptions-stats` backend | `feat/client-claims-wallet` front + `feat/client-redemptions` |
| 4 | `feat/geolocation-map` | `feat/offline-sqlite-sync` |
| 5 | `feat/push-notifications` (Firebase + panel) | `feat/offline-sqlite-sync` (pruebas modo avión) + `chore/android-build` |
| 6 | Integración E2E en celular contra Railway, bugs | Integración E2E, bugs |
| 7 | `docs/informe-final` | `docs/informe-final` + guion de demo |

**Si el tiempo no alcanza**, recortar en este orden: stats → historial de notificaciones → filtro por categoría → radio configurable del mapa. **No recortar**: QR firmado, puntos en backend, offline básico.

## 10. Criterio de "terminado" (demo)
1. Comercio crea promo "café nuevo, 250 pts" → aparece en Home del cliente.
2. Comercio envía notificación "¡Nuevo café!" → llega al celular del cliente.
3. Cliente ve el comercio en el mapa de comercios cercanos.
4. Comercio genera QR → cliente lo escanea → saldo sube.
5. Mismo QR escaneado de nuevo → rechazado.
6. En modo avión el cliente escanea → queda "por confirmar" → al volver la conexión se acredita.
7. Cliente canjea recompensa → comercio ve el código y lo marca entregado.
8. Puntos vencidos no cuentan en el saldo.
9. Todo corre contra el backend en Railway, en APK Android.

## 11. Fuera de alcance
Pedidos, pagos, iOS, niveles/gamificación, recuperación de contraseña, canjes sin conexión.
