# Lógica de puntos por comercio en Snacki

## Propósito

Snacki funciona como una wallet multicomercio. El usuario puede participar en los programas de varios comercios desde una sola app, pero cada comercio mantiene su propio saldo y su propio catálogo de recompensas.

Un saldo de Snacki no es una bolsa compartida. Los puntos de Burger House, por ejemplo, solo sirven para las recompensas de Burger House. No se transfieren a Pizza Hut ni se usan para canjear una recompensa de otra tienda.

## Conceptos

- **Usuario:** persona que acumula puntos y canjea recompensas.
- **Comercio:** negocio asociado a su propio catálogo de recompensas.
- **Saldo por comercio:** puntos que una persona tiene disponibles en un comercio específico.
- **Movimiento:** registro de una acumulación o un canje.
- **Compra:** transacción identificada de manera única que puede generar puntos.
- **Recompensa:** producto o beneficio del catálogo, con un costo fijo expresado en puntos.

La clave lógica de un saldo es la pareja **identidad local + comercio**:

```text
saldo(idLocal, comercio)
```

La identidad local tiene un `id` estable y es la que se asocia a los saldos; el correo no se usa como clave de saldo.

Por ejemplo, Elias podría tener 250 puntos en Burger House y 80 en Pizza Hut. La pantalla **Puntos** muestra esos dos saldos por separado y, además, puede mostrar la suma informativa de su wallet: 330 puntos en total. Esa suma no implica que los 330 puntos se puedan gastar en cualquiera de las dos tiendas.

## Cómo se acumulan puntos

1. El usuario compra en un comercio afiliado.
2. El comercio presenta el QR asociado a esa compra.
3. El usuario abre la pestaña **QR** y escanea el código con la cámara del dispositivo mediante Capacitor.
4. La app identifica el comercio, el identificador de compra y los puntos que el QR de demostración indica, y valida el formato de forma estricta.
5. Si el QR es válido y la clave `purchase:<comercio>:<compra>` no se había registrado antes, la app suma esos puntos al saldo de esa identidad local en ese comercio y registra el movimiento.
6. La app confirma cuántos puntos se añadieron y muestra el nuevo saldo de esa tienda.

### Evitar duplicados

Cada compra tiene un identificador y la deduplicación usa la clave `purchase:<comercio>:<compra>`. Antes de registrar una acumulación, la demo revisa si esa clave ya se usó; si existe, no vuelve a sumar los puntos. Así, volver a escanear el mismo QR de prueba no duplica el saldo, pero el mismo `id` de compra en un comercio distinto sí acredita. Los canjes se registran en el namespace `redeem:`, separado del de compras, por lo que nunca colisionan con una acumulación.

### Formato del QR de demostración

```text
snacki://purchase/<comercio-id>?id=<compra-unica>&points=<puntos>
```

Ejemplo:

```text
snacki://purchase/burger-house?id=compra-demo-001&points=25
```

Este QR permite recorrer la interfaz sin un servidor. El valor `points` es solo un dato de prueba: en esta versión no hay cálculo automático de puntos a partir del importe de una compra, ni una tasa de conversión configurada. La app tampoco puede comprobar por sí sola que la compra ocurrió.

La validación es estricta: `points` debe ser un entero decimal entre 1 y 100000, `localId` debe cumplir `[a-z0-9-]+` y `purchaseId` tiene un tope de longitud. Un QR que no cumpla estas reglas se rechaza sin acreditar nada. Las ofertas leídas del almacenamiento también se revalidan y no admiten puntos negativos.

El QR informativo `snacki://local/<comercio-id>` solo abre la ficha del comercio; no acredita puntos.

## Cómo usa el usuario sus puntos

1. El usuario abre **Explorar** o el comercio desde la wallet.
2. La ficha muestra el saldo disponible en esa tienda y sus recompensas.
3. Cada recompensa indica el costo definido por el comercio, por ejemplo, `Combo Bacon Burger · 600 PTS`.
4. Al elegir **Canjear**, la app pide confirmación.
5. La demo comprueba que el saldo del mismo comercio cubra el costo. Si no alcanza, informa que faltan puntos y conserva el saldo.
6. Si alcanza, descuenta el costo de ese comercio y registra un movimiento de canje en el namespace `redeem:` con la recompensa, la fecha y los puntos utilizados. La escritura del estado es atómica: si falla, la operación informa del error en lugar de mostrar un canje que no se guardó.
7. El nuevo saldo aparece en la ficha y en la pantalla **Puntos**.

Ejemplo: con 1.250 puntos en Burger House, el usuario puede canjear una recompensa de 600 puntos y quedar con 650 puntos allí. Ese canje no modifica los saldos de sus otros comercios.

## Administración del catálogo por el comercio

El tipo de cuenta **Comercio** abre un panel separado del área del usuario. Desde el panel, el comercio asociado puede agregar una recompensa indicando nombre y costo en puntos, o quitar una recompensa agregada. El costo representa cuántos puntos de ese mismo comercio se descuentan al canjearla.

La demo guarda el catálogo en el almacenamiento local del dispositivo y no publica cambios a otros dispositivos. Los servicios revalidan la operación: solo una cuenta de tipo `comercio` cuyo `comercioId` coincide con el del local puede alterar su catálogo. Sigue siendo una comprobación local de la maqueta, no una verificación real de la identidad del comercio.

## Qué persiste la demo actual

La implementación de demostración guarda en `localStorage` los saldos y los movimientos de acumulación y canje juntos, en un único blob atómico `snacki.demo-state`, y las recompensas agregadas por comercio. El blob se asocia al `id` estable de la identidad local, no al correo. Al arrancar se migran los datos de las claves antiguas `snacki.point-balances` y `snacki.point-movements`.

Las escrituras son atómicas: si fallan, la operación informa del error en vez de fingir éxito. Los mapas indexados se crean sin prototipo (`Object.create(null)`) y se validan al leer, para que identificadores como `__proto__` no destruyan el estado. Las ofertas leídas del almacenamiento se revalidan y no admiten puntos negativos.

Los saldos iniciales que aparecen en la app son datos de ejemplo. El inicio de sesión es local y no autentica una identidad contra un servidor: login y registro guardan un hash de contraseña solo de demostración, no criptográfico y no apto para producción. `roleGuard` redirige a `/login?returnUrl=...` para separar las dos experiencias, lo cual es solo UX y no seguridad. Por eso, esta persistencia sirve para presentar y probar el flujo en un mismo dispositivo, pero no es una fuente confiable para dinero, beneficios reales ni conciliación entre comercio y cliente.

## Reglas necesarias para producción

Cuando se conecte un backend, el servidor debe ser la fuente de verdad de los saldos y movimientos:

1. El comercio crea la compra desde una cuenta comercial autenticada.
2. El backend calcula cuántos puntos corresponden según una regla explícita del comercio (por ejemplo, puntos por importe). La tasa y reglas aún deben definirse con el producto; no están definidas por esta demo.
3. El backend emite un QR de un solo uso, firmado y con caducidad, que referencia la compra y el comercio. El cliente no debe poder editar la cantidad de puntos.
4. La app envía el token escaneado al backend junto con la sesión del usuario.
5. El servidor valida la firma, caducidad, compra, comercio, usuario y uso previo del token, y acredita puntos una sola vez.
6. El backend devuelve el saldo de ese usuario en ese comercio. El comercio consulta únicamente sus propias cuentas y movimientos autorizados.
7. Para canjear, la app pide el canje al servidor. Este valida saldo, comercio y disponibilidad de la recompensa, y descuenta los puntos en una operación atómica. El comercio recibe la confirmación del mismo registro central.

En producción, el comercio debe ver el saldo específico del cliente en su tienda después de una consulta autenticada, y ambas partes deben consultar el mismo historial del servidor. No se debe confiar en el saldo enviado desde el teléfono ni en un QR estático que contenga una cantidad editable.

Las mejoras descritas para la demo local (estado atómico, validaciones y revalidaciones) fortalecen la maqueta y no sustituyen estos requisitos de producción.

## Archivos principales de la implementación

- `src/app/services/store.service.ts`: saldos, registro de movimientos y catálogo de recompensas local.
- `src/app/services/demo-storage.ts`: lectura y escritura atómica del estado de la demo y mapas sin prototipo.
- `src/app/services/scanner.service.ts`: escaneo Capacitor, validación estricta y lectura de los formatos de QR de la demo.
- `src/app/services/auth.service.ts`: identidad local con `id` estable y sesión de demostración.
- `src/app/services/role.guard.ts`: separación de UX entre experiencias con redirección a `/login?returnUrl=...`.
- `src/app/pages/qr/qr.page.ts`: procesamiento de la compra escaneada y mensajes de resultado.
- `src/app/pages/tienda/tienda.page.ts`: confirmación y ejecución local del canje.
- `src/app/pages/puntos/puntos.page.ts`: resumen de saldos e historial del usuario.
- `src/app/pages/comercio/comercio.page.ts`: administración local del catálogo por el rol de comercio.
