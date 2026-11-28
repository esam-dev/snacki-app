# Lógica de puntos por comercio en Snacki

## Propósito
Snacki es una wallet multicomercio: cada comercio mantiene su propio saldo y catálogo. Los puntos no se comparten ni transfieren entre comercios.

## Conceptos
- **Usuario / Comercio / Saldo por comercio / Movimiento / Compra / Recompensa** (costo fijo en puntos).
- Clave lógica: `saldo(idLocal, comercio)` (identidad local con `id` estable; el correo no es clave).
- **Puntos** muestra saldos separados y un total informativo de wallet (no gastable entre tiendas).

## Acumulación
1. Compra en comercio afiliado → QR de compra.
2. Usuario escanea en **QR** (Capacitor).
3. App valida formato, identifica comercio/compra/puntos y, si `purchase:<comercio>:<compra>` no existe, suma al saldo de esa identidad en ese comercio y registra movimiento.
4. Confirma puntos añadidos y nuevo saldo.

- **Deduplicación:** clave `purchase:<comercio>:<compra>` (mismo `id` en otro comercio sí acredita). Canjes en namespace `redeem:`.
- **QR demo:** `snacki://purchase/<comercio-id>?id=<compra-unica>&points=<puntos>` (ej. `.../burger-house?id=compra-demo-001&points=25`). `points` es dato de prueba (sin cálculo por importe/tasa). Validación estricta: `points` entero 1..100000, `localId` `[a-z0-9-]+`, `purchaseId` acotado. QR informativo `snacki://local/<comercio-id>` no acredita.

## Uso/canje
1. Usuario abre comercio, ve saldo y recompensas (costo en puntos).
2. **Canjear** pide confirmación; se valida saldo del mismo comercio.
3. Si alcanza, descuenta y registra canje (`redeem:`) con recompensa/fecha/puntos; escritura atómica. Si no, informa faltante sin modificar saldo.

## Catálogo del comercio
Cuenta **Comercio** gestiona recompensas (nombre/costo) de su local. Demo guarda en almacenamiento local (no sincroniza). Servicios revalidan que solo el comercio autorizado (`tipo=comercio`, `comercioId` coincidente) altere su catálogo (control local, no identidad real).

## Persistencia demo actual
- `localStorage` en blob atómico `snacki.demo-state` (saldos+movimientos) por `id` local estable; migra claves legacy `snacki.point-balances`/`snacki.point-movements`. Ofertas en clave separada, revalidadas (sin puntos negativos).
- Escrituras atómicas; mapas sin prototipo (`Object.create(null)`) y validados al leer. Saldos iniciales son de ejemplo.
- Login/registro locales con hash de contraseña solo de demostración (no criptográfico). `roleGuard` es separación UX, no seguridad. No apto para dinero/beneficios reales ni conciliación.

## Reglas para producción
Servidor como fuente de verdad: compra autenticada → cálculo de puntos por reglas del comercio → QR/token firmado, de un solo uso y con caducidad (cantidad no editable por cliente) → app envía token con sesión → servidor valida y acredita una vez → saldo/canje consultados y ejecutados en servidor (validación atómica de saldo/comercio/recompensa). Comercio ve solo sus cuentas/movimientos autorizados; no confiar en saldo del dispositivo ni en QR estático editable.

## Archivos principales
- `src/app/services/store.service.ts`: saldos, movimientos y catálogo local.
- `src/app/services/demo-storage.ts`: estado atómico y mapas sin prototipo.
- `src/app/services/scanner.service.ts`: escaneo/validación de QR demo.
- `src/app/services/auth.service.ts`: identidad local y sesión demo.
- `src/app/services/role.guard.ts`: separación UX por rol.
- `src/app/pages/qr/qr.page.ts`, `tienda/tienda.page.ts`, `puntos/puntos.page.ts`, `comercio/comercio.page.ts`: flujos de acreditación, canje, resumen y administración.