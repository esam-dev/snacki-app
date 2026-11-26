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
| API comercio: promos, recompensas (con foto) y settings + panel comercio responsive con mapa del local (`feat/merchant-catalog`, PR #7) | Wallet, canjes, stats, referidos, comercios cercanos para el cliente |
| Catálogo del cliente desde la API: `/catalog/*` (promos vigentes, recompensas, logo e imágenes; se refresca al entrar, al volver a la app y cada 60 s) (PR #10) | SQLite offline + sincronización, mapa, push, deploy Railway, build Android, pulido UX, informe |
| QR firmado generado por el comercio + `POST /api/claims` atómico, una vez por QR (`feat/merchant-qr`) | |
| Escáner QR (`@capacitor-mlkit/barcode-scanning`); `@capacitor-community/sqlite` instalado sin usar | |

## 3. Arquitectura
```
App Ionic/Angular (Capacitor)
 ├─ SQLite local  ── caché de saldos/promos/recompensas/comercios + cola pending_ops
 ├─ SyncService   ── @capacitor/network: al volver la conexión envía la cola y refresca la caché
 ├─ Geolocation   ── @capacitor/geolocation → comercios cercanos en mapa (Leaflet + OpenStreetMap)
 └─ Push          ── recibe notificaciones (Firebase Cloud Messaging)
        │ HTTPS + JWT
Backend Fastify + Prisma (Railway) ── Postgres (Railway) = fuente de verdad
        ├─ ClaimService     ── valida QR, acredita EARN y liquida referidos en la misma transacción
        └─ firebase-admin   ── envía push
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
- `PATCH /api/merchant/settings` (`pointsExpireAt`, dirección, lat/lng, categoría, logo, **reglas de referidos**) (hecho: base; pendiente: referidos)
- `POST /api/merchant/qr` `{productId, quantity}` → `{claimId, token, qrContent, expiresAt, points}` (token compacto `S1.<claimId>.<exp>.<HMAC-SHA256>` firmado con `QR_SECRET`; el QR codifica `snacki://claim/<token>` con el logo de Snacki al centro) (hecho)
- `GET /api/merchant/qr/:id` → `pending | claimed | expired` (la pantalla del QR muestra "escaneado") (hecho)
- `POST /api/merchant/qr/:id/void` → anula un QR no canjeado (venta cancelada) (hecho)
- `GET /api/merchant/redemptions` · `PATCH /api/merchant/redemptions/:id/deliver`
- `GET /api/merchant/stats` → puntos emitidos, canjes, clientes únicos, clientes recurrentes (2+ compras), promo más escaneada y **referidos** (pendientes, completados, clientes nuevos por referido, bono emitido, conversión)
- `POST /api/merchant/notifications` `{title, body, productId?}` → push a sus clientes · `GET` historial

**Cliente**
- `GET /api/catalog/tenants` ✅ (comercios activos con promos vigentes y recompensas activas; requiere sesión)
- `GET /api/catalog/images/:kind/:id` ✅ (`kind` = `tenant|product|reward`; sirve las fotos subidas por el comercio, pública y cacheable)
- `GET /api/promos?category=&lat=&lng=` (promos vigentes, "lo nuevo")
- `GET /api/tenants/nearby?lat=&lng=&radiusKm=` (comercios adheridos con distancia)
- `GET /api/tenants/:slug` (promos vigentes + recompensas + si tiene referidos activos)
- `POST /api/claims` `{token}` → acredita una vez (`UPDATE ... WHERE claimedAt IS NULL` en transacción + `point_entries.claim_id` único); `400` QR inválido, `403` QR propio, `409` ya usado, `410` vencido/anulado. ✅ (integrado en la app del cliente)
  - **Integración referidos**: si existe un `Referral PENDING` del usuario en ese tenant y es su primera compra promocional válida, en la **misma transacción** se marca `COMPLETED` y se liquidan los `REFERRAL_BONUS`. Respuesta incluye `referralBonus` si aplicó.
- `POST /api/sync/claims` `{ops:[{localId, token}]}` → resultado por op (usa el mismo `ClaimService`, por lo que también liquida referidos)
- `GET /api/wallet` ✅ (saldo, próximo vencimiento y progreso a la siguiente recompensa por comercio) · `GET /api/wallet/movements` · `GET /api/wallet/:tenantId/movements` ✅
- **Canje solo con QR del comercio** ✅: el comercio genera `POST /api/merchant/redeem-qr` `{rewardId}` (token `R1`, `snacki://redeem/…`, 10 min, un solo uso; `GET /redeem-qr/:id` muestra a quién entregar y el código; `POST /redeem-qr/:id/void`). El cliente escanea → `POST /api/redemptions/preview` `{token}` (recompensa, costo, saldo) → confirma → `POST /api/redemptions` `{token}`: bloquea sus puntos (`FOR UPDATE`), descuenta FIFO por vencimiento y crea el `Redemption` entregado, todo en una transacción. `409 INSUFFICIENT_POINTS` no toca nada; `409` ya usado; `410` vencido/anulado o recompensa no disponible. No existe canje sin QR.
- **`POST /api/referrals/apply`** `{code}` → crea `Referral PENDING`; errores: código inválido, auto-referido, ya es cliente del comercio, ya fue referido, comercio sin referidos, tope alcanzado
- **`GET /api/referrals/me`** → por comercio: mi código, referidos pendientes/completados, bono ganado
- `POST /api/devices` `{token, platform}` (registrar token push)

## 7. Plugins y librerías
| Uso | Paquete |
|---|---|
| SQLite | `@capacitor-community/sqlite` (ya instalado) + `jeep-sqlite` para web |
| Conexión | `@capacitor/network` |
| Ubicación | `@capacitor/geolocation` |
| Mapa | `leaflet` + OpenStreetMap (gratis, sin API key) |
| Push | `@capacitor/push-notifications` + Firebase Cloud Messaging; backend `firebase-admin` |
| Generar QR | `qrcode` |
| Escanear QR | `@capacitor-mlkit/barcode-scanning` (ya instalado) |
| Compartir código de referido | `@capacitor/share` (opcional; fallback copiar al portapapeles) |

Permisos Android: ubicación, cámara, notificaciones (Android 13+). `google-services.json` y `.env` **no se suben al repo**; se comparten por fuera.

## 8. Ramas y responsables
Todas salen de `develop` y vuelven por PR a `develop` (revisa la otra persona). Al final, `develop` → `main` para la entrega.

| Rama | Responsable | Objetivo / terminado cuando… | Estado |
|---|---|---|---|
| `feat/db-schema-seed` | A + B | Migración Prisma con los modelos de §4 + seed (4 comercios con coordenadas, promos, recompensas; usuarios demo) | Hecho (PR #6) |
| `feat/merchant-catalog` | A | CRUD promos y recompensas + settings (back + panel comercio) | Hecho (PR #7) |
| `chore/deploy-railway` | B | API + Postgres en Railway, `/health` responde, variables `JWT_SECRET`, `QR_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, Firebase | En curso |
| `feat/merchant-qr` | A | Comercio genera QR de una promo vigente y lo muestra en pantalla | Hecho (falta PR) |
| `feat/client-claims-wallet` | B | Escanear → `POST /claims` → saldo; wallet por comercio con progreso a recompensa y vencimientos; movimientos; canje de recompensas solo con QR del comercio | Hecho (PR) |
| `feat/referrals-engine` | A | Migración `ReferralCode` + `Referral` + reglas en `Tenant`; `POST /referrals/apply`, `GET /referrals/me`; liquidación `REFERRAL_BONUS` dentro de `ClaimService`; settings de referidos en panel; pantalla "Invita y gana" en cliente; tests (auto-referido, doble referido, cliente existente, bono una sola vez, claim offline sincronizado) | Pendiente |
| `feat/merchant-redemptions-stats` | A | Lista de canjes, marcar entregado, estadísticas con métricas de recompra y referidos | Pendiente |
| `feat/client-redemptions` | B | Canjear recompensa con código; errores de saldo insuficiente y sin red | Cubierto por `feat/client-claims-wallet` (canje con QR) |
| `feat/offline-sqlite-sync` | B | SQLite local, cola `pending_ops`, `SyncService`, indicador "sin conexión / por confirmar" | Pendiente |
| `feat/geolocation-map` | A | Mapa de comercios cercanos en Explorar (la ubicación del local ya está en settings) | Parcial |
| `feat/push-notifications` | A | Registro de token, panel para enviar notificación, cliente la recibe en Android; aviso de vencimiento de puntos (opcional) | Pendiente |
| `chore/android-build` | B | `npx cap add android`, permisos, APK apuntando a Railway | Pendiente |
| `fix/polish-ux-details` | A + B | Ver §9 | Pendiente |
| `docs/informe-final` | A + B | Informe, diagramas, README actualizado, guion de demo | Pendiente |

## 9. Arreglos y pulido (`fix/polish-ux-details`)
Rama corta al final, después de integrar; cada punto es un commit pequeño.

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
- Hoy `/android` está ignorado completo: decidir en `chore/android-build` si se versiona `android/` (sin `build/` ni `google-services.json`) para conservar permisos y configuración.
- `.env.example` actualizado en front y backend.

## 10. Cronograma
| Día | Persona A (Comercio + referidos + mapa + push) | Persona B · Bastian (Cliente + offline + infra) |
|---|---|---|
| 1 | Hecho. Juntos: `feat/db-schema-seed`, contrato API (§6) | Hecho. Juntos + inicio `chore/deploy-railway` |
| 2 | Hecho: `feat/merchant-catalog`. Siguiente: `feat/merchant-qr` | `chore/deploy-railway` + `feat/client-claims-wallet` backend + tests (doble escaneo, vencido) |
| 3 | `feat/referrals-engine` backend (migración, apply/me, liquidación en `ClaimService`, tests) | `feat/client-claims-wallet` front (progreso, vencimientos) + `feat/client-redemptions` |
| 4 | `feat/referrals-engine` front + `feat/merchant-redemptions-stats` | `feat/offline-sqlite-sync` |
| 5 | `feat/geolocation-map` + `feat/push-notifications` | `feat/offline-sqlite-sync` (pruebas modo avión, claim offline que completa referido) + `chore/android-build` |
| 6 | Integración E2E en celular contra Railway + `fix/polish-ux-details` | Integración E2E + `fix/polish-ux-details` |
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
