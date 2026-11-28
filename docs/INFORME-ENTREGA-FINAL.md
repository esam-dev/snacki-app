# Informe de entrega final – Snacki (APK)

Fecha: 27/11/2026 · Autores: Elías Ortiz y Bastian Herrera

Snacki se entrega como APK Android conectado al backend y la base de datos en Railway.

**Descargar el APK:** https://github.com/esam-dev/snacki-app/releases/download/v1.0.0/snacki-v1.0.0.apk
(página del release: https://github.com/esam-dev/snacki-app/releases/tag/v1.0.0)

## 1. Qué es Snacki y qué se entrega

Snacki es una wallet de puntos para varios comercios de comida (heladerías, comida rápida, pizzerías y cafeterías). No es una app de pedidos ni de pagos: la compra se hace en el local y Snacki solo registra los puntos.

- El **comercio** crea promociones que dan puntos y genera un QR firmado al vender una.
- El **cliente** escanea el QR, acumula puntos en ese comercio y los canjea por recompensas antes de que venzan.
- Los puntos de un comercio nunca sirven en otro.

Se entrega:

| Entregable | Enlace / ubicación |
|---|---|
| APK Android (debug) | [snacki-v1.0.0.apk](https://github.com/esam-dev/snacki-app/releases/download/v1.0.0/snacki-v1.0.0.apk) (GitHub Release v1.0.0) |
| Repositorio | https://github.com/esam-dev/snacki-app (rama `develop`) |
| API (Railway) | https://snacki-app-production.up.railway.app/health |
| Versión web (Firebase Hosting) | https://snacki.web.app |

## 2. Funcionalidades terminadas

Todo está integrado en `develop` (PR #1 a #21) y funciona contra el backend en Railway.

| Rol | Funcionalidad | PR |
|---|---|---|
| Ambos | Registro e inicio de sesión con JWT | #3, #5 |
| Comercio | Crear, editar y archivar promociones y recompensas con foto | #7 |
| Comercio | Configurar el local: categoría, logo, vencimiento de puntos, ubicación en el mapa | #7, #15 |
| Comercio | Generar QR firmado de venta (24 h, un solo uso) y QR de canje (10 min) | #12, #14 |
| Comercio | Sucursales: el asistente propone cambios y el titular los aprueba o rechaza | #16 |
| Comercio | Estadísticas por período (7, 30, 90 días): puntos, canjes, clientes recurrentes, referidos | #18 |
| Cliente | Escanear QR con la cámara y sumar puntos en ese comercio | #4, #14 |
| Cliente | Wallet por comercio: saldo, progreso a la próxima recompensa, vencimientos y movimientos | #14 |
| Cliente | Canjear recompensas escaneando el QR del comercio | #14 |
| Cliente | "Invita y gana": código de referido por comercio y bono para ambos en la primera compra | #17 |
| Cliente | Mapa de comercios cercanos ordenados por distancia y "Cómo llegar" | #15, #19 |
| Infra | API y base en Railway, web en Firebase Hosting, deploy automático al mergear a `develop` | #13 |
| Infra | Proyecto Android versionado y APK apuntando a Railway | #21 |

## 3. Tecnologías y arquitectura

El celular nunca decide saldos: la app llama a la API por HTTPS con JWT, y la API valida cada QR y escribe en PostgreSQL. La app no se conecta directo a la base de datos.

```
APK Android (Ionic + Angular + Capacitor)
        │  HTTPS + JWT
        ▼
API Fastify + Prisma (Railway) ──► PostgreSQL (Railway)
        ▲
Web (Firebase Hosting)
```

| Capa | Tecnología | Dónde corre |
|---|---|---|
| App móvil | Ionic 9 + Angular 22 + Capacitor 8 | APK Android |
| Escáner QR | `@capacitor-mlkit/barcode-scanning` | Celular |
| Mapa | Componente propio sobre OpenStreetMap | Celular |
| API | Node.js + TypeScript + Fastify 5 | Railway |
| Base de datos | PostgreSQL 16 + Prisma 6 | Railway |
| Web | Build de Ionic | Firebase Hosting |
| CI/CD | GitHub Actions: lint, tests y deploy en cada merge a `develop` | GitHub |

Seguridad del QR: cada código es un token firmado con HMAC-SHA256, de un solo uso y con vencimiento. Escanearlo dos veces responde "Este QR ya fue usado" (409); vencido responde 410.

## 4. El APK: cómo instalarlo

1. Desde el celular Android, abrir https://github.com/esam-dev/snacki-app/releases/download/v1.0.0/snacki-v1.0.0.apk y descargar el archivo.
2. Abrirlo y permitir "Instalar apps desconocidas" para el navegador o el gestor de archivos.
3. Abrir Snacki y aceptar los permisos de cámara (escáner QR) y ubicación (mapa).
4. Iniciar sesión con un usuario de prueba (sección 5). Necesita internet: se conecta a la API de Railway.

Para generarlo de nuevo desde el código (PowerShell, en la raíz del proyecto; requiere JDK 21 y el SDK de Android):

```powershell
$env:RAILWAY_API_URL = "https://snacki-app-production.up.railway.app"
npm run android:sync
cd android
.\gradlew.bat assembleDebug
```

El archivo queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## 5. Usuarios de prueba y guion de demo

Todas las cuentas usan la contraseña `Demo1234!`.

| Rol | Email | Tienda |
|---|---|---|
| Cliente | `cliente@snacki.demo` | — |
| Comercio (titular) | `comercio@snacki.demo` | Burger House |
| Sucursal (asistente) | `sucursal@snacki.demo` | Burger House |
| Comercio | `heladeria@snacki.demo` | Heladería Polar |
| Comercio | `cafeteria@snacki.demo` | Café Central |
| Comercio | `pizzeria@snacki.demo` | Pizzería Napoli |

Guion (dos celulares, o uno con el APK y otro con la web):

1. Entrar como `comercio@snacki.demo` y crear una promo, por ejemplo "Café nuevo, 250 pts".
2. Entrar como `cliente@snacki.demo`: la promo aparece con la insignia "Da 250 pts" y la tienda en el mapa de Explorar.
3. El comercio genera el QR de la venta; el cliente lo escanea y el saldo de Burger House sube. El de otro comercio no cambia.
4. Escanear el mismo QR otra vez: aparece "Este QR ya fue usado".
5. El comercio genera un QR de canje; el cliente lo escanea, confirma y se descuentan los puntos.
6. El cliente comparte su código de "Invita y gana"; otro cliente nuevo lo aplica y ambos reciben el bono en su primera compra.
7. El comercio revisa Estadísticas: puntos emitidos, canjes y referidos completados.
8. Entrar como `sucursal@snacki.demo`, editar una promo y aprobar el cambio desde la cuenta titular.

## 6. Límites conocidos

- El APK es de **debug** (sin firma de publicación): se instala a mano, no desde Google Play.
- Solo Android; iOS queda fuera de alcance.
- No hay modo sin conexión: escanear y canjear requieren internet (SQLite está instalado pero sin usar).
- Las notificaciones push del comercio no están implementadas.
- Railway puede tardar unos segundos en responder la primera petición si el servicio estaba inactivo.

## 7. Texto para publicar en el foro

> **Entrega final – Snacki**
>
> Integrantes: Elías Ortiz y Bastian Herrera.
>
> Snacki es una app de fidelización para comercios de comida: el comercio genera un QR al vender una promoción y el cliente lo escanea para sumar puntos en ese local y canjearlos por recompensas. Incluye referidos ("Invita y gana"), mapa de comercios cercanos, sucursales con aprobación de cambios y estadísticas para el comercio.
>
> - **Descargar APK:** https://github.com/esam-dev/snacki-app/releases/download/v1.0.0/snacki-v1.0.0.apk (instalar permitiendo "apps desconocidas").
> - Repositorio: https://github.com/esam-dev/snacki-app (rama `develop`)
> - Backend: Railway (Fastify + PostgreSQL) · Web: https://snacki.web.app
> - Usuarios de prueba (contraseña `Demo1234!`): `cliente@snacki.demo` (cliente) y `comercio@snacki.demo` (comercio).
>
> Tecnologías: Ionic 9, Angular 22, Capacitor 8, Node.js + Fastify, PostgreSQL + Prisma, Railway, Firebase Hosting y GitHub Actions.
