# Flujo de QR y puntos por comercio

## Tipos de cuenta
- **Usuario final:** ve su wallet, escanea QR de compra y canjea recompensas con puntos de cada comercio.
- **Comercio:** se registra vinculado a un comercio y gestiona su catálogo de recompensas/costos.

`roleGuard` separa experiencias por UX (redirige a `/login?returnUrl=...`), no es seguridad de producción. Cuentas, catálogo y saldos son locales/demo.

## Recorrido del usuario
1. Compra en un comercio afiliado y recibe su QR.
2. En **QR** escanea el código (Capacitor).
3. La app acredita puntos al saldo de ese comercio (historial incluido).
4. En **Puntos** ve saldos/movimientos por comercio.
5. En la ficha del comercio canjea una recompensa: se descuentan puntos solo de ese comercio.

## QR de demo
- Informativo: `snacki://local/<comercio-id>` (abre comercio, no acredita).
- Compra: `snacki://purchase/<comercio-id>?id=<compra-unica>&points=<puntos>` (ej. `snacki://purchase/burger-house?id=compra-demo-001&points=25`).

Deduplicación por `purchase:<comercio>:<compra>`; canjes usan namespace `redeem:`. Es simulación, no valida la compra real.

## Validación y estado local
- Validación estricta: `points` entero 1..100000, `localId` `[a-z0-9-]+`, `purchaseId` con tope de longitud. Ofertas revalidadas (sin puntos negativos).
- Estado atómico en `snacki.demo-state` (saldos+movimientos) asociado al `id` local estable; migra claves legacy al arrancar. Escrituras atómicas; mapas sin prototipo y validados al leer.
- Login/registro usan hash de contraseña solo de demostración (no criptográfico, no apto para producción).

## Integración requerida para producción
`points` del QR demo no es confiable. En producción: backend crea compra autenticada y calcula puntos; emite token QR firmado, de corta duración y un solo uso; la app lo envía a API autenticada y el servidor valida/acredita de forma idempotente; saldo/canje se consultan y ejecutan en servidor (operación atómica, fuente de verdad central). Caché local no autoriza saldos ni canjes.