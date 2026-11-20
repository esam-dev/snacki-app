# Flujo de QR y puntos por comercio

## Tipos de cuenta

- **Usuario final:** ve su wallet, escanea QR de compra y canjea recompensas con los puntos de cada comercio.
- **Comercio:** se registra vinculado a un comercio y entra a su panel para agregar o quitar recompensas y definir su costo en puntos.

La selección de rol del login y las rutas de cada experiencia están separadas en la app. `roleGuard` redirige a `/login?returnUrl=...` cuando la cuenta activa no tiene el rol esperado, para volver al destino original tras iniciar sesión. En esta versión las cuentas, el catálogo y los saldos son locales y de demostración: esta separación es solo de UX, no un mecanismo de seguridad de producción.

## Recorrido del usuario

1. El usuario compra en un comercio afiliado.
2. El comercio presenta el QR correspondiente a esa compra.
3. En la pestaña **QR**, el usuario escanea el código con la cámara de Capacitor.
4. La app registra los puntos en el saldo de ese comercio y agrega la compra al historial.
5. En **Puntos**, el usuario ve el saldo y movimientos de cada comercio por separado.
6. En la ficha del comercio, el usuario elige una recompensa y confirma el canje. Se descuentan puntos de ese comercio, nunca de otro.

## QR disponible en la demo local

El escáner acepta el QR informativo `snacki://local/<comercio-id>` para abrir un comercio, y un QR de prueba de compra:

```text
snacki://purchase/<comercio-id>?id=<compra-unica>&points=<puntos>
```

Ejemplo: `snacki://purchase/burger-house?id=compra-demo-001&points=25`. La acreditación se deduplica con la clave `purchase:<comercio>:<compra>`: el mismo identificador de compra en un comercio distinto sí acredita. Los canjes usan el namespace `redeem:` separado, así que no colisionan con las compras. Es una simulación de interfaz y no valida la compra ni comunica datos al comercio.

## Validación y estado local de la demo

El QR se valida de forma estricta antes de acreditar: `points` debe ser un entero decimal entre 1 y 100000, `localId` debe cumplir `[a-z0-9-]+` y `purchaseId` tiene un tope de longitud. Las ofertas leídas del almacenamiento se revalidan y no admiten puntos negativos.

Saldos y movimientos se guardan juntos en un único blob atómico `snacki.demo-state`, asociado al `id` estable de la identidad local (no al correo). Al arrancar se migran los datos de las claves antiguas `snacki.point-balances` y `snacki.point-movements`. Las escrituras son atómicas: si fallan, la operación informa del error en vez de fingir que se guardó. Los mapas indexados se crean sin prototipo (`Object.create(null)`) y se validan al leer, de modo que identificadores como `__proto__` no corrompan el estado.

El inicio de sesión y el registro guardan un hash de contraseña solo de demostración: no es criptográfico y no es apto para producción. Estas mejoras refuerzan la maqueta local; no sustituyen los requisitos de la sección siguiente.

## Integración requerida antes de operar con comercios reales

La app actual no incluye servidor, sesión autenticada segura ni sincronización entre dispositivos. `points` del QR de demo no se debe aceptar como fuente confiable en producción.

Para el flujo real:

1. El comercio crea una compra autenticada en el backend, que calcula los puntos con las reglas de ese comercio.
2. El backend emite un token QR firmado, de corta duración y de un solo uso, ligado al comercio, compra e importe/regla aplicable. El QR no debe contener un saldo editable ni credenciales.
3. La app envía el token a una API autenticada. El servidor verifica firma, expiración, comercio, usuario y que la compra no se haya procesado, y registra una transacción idempotente.
4. Una API de saldo devuelve al usuario y al comercio autorizado el balance de ese usuario para ese comercio. El comercio nunca consulta los saldos de otros comercios.
5. El canje también se solicita al backend; este valida el saldo y la recompensa y descuenta puntos en una operación atómica. El comercio confirma el canje contra el mismo registro.

El registro central de transacciones es la fuente de verdad para acumular, revertir y canjear puntos. SQLite/`localStorage` pueden ayudar con caché y modo sin conexión, pero no autorizan saldos ni canjes por sí mismos.
