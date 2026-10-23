# Base de Datos - Snacki App

## Configuración

La aplicación utiliza \@capacitor-community/sqlite\ para gestionar una base de datos SQLite local.

## Estructura de la Base de Datos

### Tablas Principales

- \products\ - Catálogo de productos/snacks
- \categories\ - Categorías de productos
- \orders\ - Pedidos realizados
- \order_items\ - Detalles de pedidos
- \users\ - Usuarios de la aplicación
- \settings\ - Configuraciones de la app

## Inicialización

El servicio \DatabaseService\ se encarga de:
1. Inicializar la conexión SQLite
2. Crear las tablas si no existen
3. Ejecutar migraciones
4. Proveer acceso a la base de datos

## Uso

`	ypescript
import { DatabaseService } from './core/services/database.service';

constructor(private db: DatabaseService) {}

async loadProducts() {
  const products = await this.db.query('SELECT * FROM products WHERE active = 1');
  return products;
}
`

## Migraciones

Las migraciones se gestionan en \src/app/data/db/migrations/\. Cada migración debe tener un número de versión incremental.
