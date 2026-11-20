import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { Producto, StoreService } from './store.service';

interface SessionUser {
  id: string;
  nombre: string;
  correo: string;
  tipo: 'cliente' | 'comercio';
  comercioId?: string;
}

const CLIENTE: SessionUser = {
  id: 'cli-1',
  nombre: 'Elias',
  correo: 'elias@example.com',
  tipo: 'cliente',
};

const COMERCIO_BURGER: SessionUser = {
  id: 'com-burger',
  nombre: 'Burger House',
  correo: 'burger@example.com',
  tipo: 'comercio',
  comercioId: 'burger-house',
};

function writeSession(user: SessionUser): void {
  localStorage.setItem('snacki.current-user', JSON.stringify(user));
}

function crearStore(user: SessionUser): StoreService {
  TestBed.resetTestingModule();
  writeSession(user);
  TestBed.configureTestingModule({ providers: [AuthService, StoreService] });
  return TestBed.inject(StoreService);
}

function saldo(store: StoreService, localId: string): number {
  return store.getById(localId)?.puntos ?? Number.NaN;
}

describe('StoreService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it('acumula puntos solo en el local escaneado, persiste el estado y crea un movimiento de acumulacion', () => {
    const store = crearStore(CLIENTE);

    expect(store.acreditarCompra('burger-house', 'compra-1', 25)).toBe('ok');

    expect(saldo(store, 'burger-house')).toBe(1275);
    expect(saldo(store, 'pizza-hut')).toBe(6250);
    expect(saldo(store, 'quattro-d')).toBe(3000);
    expect(saldo(store, 'spaghettoteca')).toBe(2000);

    const movimiento = store.movimientos.find((item) => item.id === 'purchase:burger-house:compra-1');
    expect(movimiento).toBeDefined();
    expect(movimiento?.tipo).toBe('acumulacion');
    expect(movimiento?.localId).toBe('burger-house');
    expect(movimiento?.puntos).toBe(25);

    const estado = localStorage.getItem('snacki.demo-state');
    expect(estado).not.toBeNull();
    expect(estado).toContain('saldos');
    expect(estado).toContain('movimientos');
  });

  it('acepta el mismo purchaseId en otro local y marca duplicado solo al repetirlo en el mismo local', () => {
    const store = crearStore(CLIENTE);

    expect(store.acreditarCompra('burger-house', 'compra-compartida', 25)).toBe('ok');
    expect(store.acreditarCompra('pizza-hut', 'compra-compartida', 25)).toBe('ok');

    expect(saldo(store, 'burger-house')).toBe(1275);
    expect(saldo(store, 'pizza-hut')).toBe(6275);
    expect(store.movimientos.filter((item) => item.id.includes('compra-compartida'))).toHaveLength(2);

    expect(store.acreditarCompra('burger-house', 'compra-compartida', 25)).toBe('duplicado');
    expect(saldo(store, 'burger-house')).toBe(1275);
    expect(store.movimientos).toHaveLength(2);
  });

  it('rechaza puntos invalidos y local inexistente sin modificar saldos ni movimientos', () => {
    const store = crearStore(CLIENTE);
    const casos: ReadonlyArray<readonly [string, string, number]> = [
      ['burger-house', 'p-cero', 0],
      ['burger-house', 'p-negativo', -5],
      ['burger-house', 'p-no-entero', 10.5],
      ['burger-house', 'p-demasiados', 100001],
      ['local-inexistente', 'p-local', 10],
    ];

    for (const [localId, purchaseId, puntos] of casos) {
      expect(store.acreditarCompra(localId, purchaseId, puntos)).toBe('invalido');
    }

    expect(saldo(store, 'burger-house')).toBe(1250);
    expect(store.movimientos).toHaveLength(0);
  });

  it('canjea con saldo suficiente, descuenta solo ese local y registra un movimiento de canje', () => {
    const store = crearStore(CLIENTE);
    const producto = store.getById('burger-house')?.productos[0];
    expect(producto).toBeDefined();

    const saldosAntes = Object.fromEntries(store.getAll().map((local) => [local.id, local.puntos]));

    expect(store.canjear('burger-house', producto!)).toBe('ok');

    expect(saldo(store, 'burger-house')).toBe(saldosAntes['burger-house']! - producto!.puntos);
    expect(saldo(store, 'pizza-hut')).toBe(saldosAntes['pizza-hut']!);
    expect(saldo(store, 'quattro-d')).toBe(saldosAntes['quattro-d']!);
    expect(saldo(store, 'spaghettoteca')).toBe(saldosAntes['spaghettoteca']!);

    const movimiento = store.movimientos.find((item) => item.tipo === 'canje' && item.localId === 'burger-house');
    expect(movimiento).toBeDefined();
    expect(movimiento?.descripcion).toBe(producto!.nombre);
    expect(movimiento?.puntos).toBe(producto!.puntos);
  });

  it('no modifica nada cuando el saldo es insuficiente', () => {
    const comercio = crearStore(COMERCIO_BURGER);
    expect(comercio.agregarRecompensa('burger-house', 'Recompensa costosa', 5000)).toBe(true);

    const store = crearStore(CLIENTE);
    const producto = store.getById('burger-house')?.productos.find((item) => item.nombre === 'Recompensa costosa');
    expect(producto).toBeDefined();

    const saldosAntes = store.getAll().map((local) => local.puntos);
    const movimientosAntes = store.movimientos.length;

    expect(store.canjear('burger-house', producto!)).toBe('saldo-insuficiente');

    expect(store.getAll().map((local) => local.puntos)).toEqual(saldosAntes);
    expect(store.movimientos).toHaveLength(movimientosAntes);
  });

  it('rechaza un producto fuera del catalogo', () => {
    const store = crearStore(CLIENTE);
    const saldoAntes = saldo(store, 'burger-house');
    const movimientosAntes = store.movimientos.length;
    const producto: Producto = { nombre: 'Producto inexistente', puntos: 10, imagen: 'assets/img/no-existe.png' };

    expect(store.canjear('burger-house', producto)).toBe('invalido');

    expect(saldo(store, 'burger-house')).toBe(saldoAntes);
    expect(store.movimientos).toHaveLength(movimientosAntes);
  });

  it('deja saldo 0 en un canje exacto y no vuelve al saldo semilla', () => {
    const comercio = crearStore(COMERCIO_BURGER);
    expect(comercio.agregarRecompensa('burger-house', 'Canje total', 1250)).toBe(true);

    const cliente = crearStore(CLIENTE);
    const producto = cliente.getById('burger-house')?.productos.find((item) => item.nombre === 'Canje total');
    expect(producto).toBeDefined();

    expect(cliente.canjear('burger-house', producto!)).toBe('ok');
    expect(saldo(cliente, 'burger-house')).toBe(0);
    expect(cliente.getAll().find((local) => local.id === 'burger-house')?.puntos).toBe(0);

    const recargado = crearStore(CLIENTE);
    expect(saldo(recargado, 'burger-house')).toBe(0);
  });

  it('mantiene aislados saldos y movimientos de dos usuarios distintos', () => {
    const usuarioA: SessionUser = { ...CLIENTE, id: 'user-a', correo: 'user-a@example.com' };
    const usuarioB: SessionUser = { ...CLIENTE, id: 'user-b', correo: 'user-b@example.com' };

    const storeA = crearStore(usuarioA);
    expect(storeA.acreditarCompra('burger-house', 'a-1', 100)).toBe('ok');

    const storeB = crearStore(usuarioB);
    expect(saldo(storeB, 'burger-house')).toBe(1250);
    expect(storeB.movimientos).toHaveLength(0);

    expect(storeB.acreditarCompra('pizza-hut', 'b-1', 200)).toBe('ok');

    expect(saldo(storeA, 'burger-house')).toBe(1350);
    expect(storeA.movimientos).toHaveLength(1);
    expect(saldo(storeB, 'pizza-hut')).toBe(6450);
    expect(saldo(storeB, 'burger-house')).toBe(1250);
    expect(storeB.movimientos).toHaveLength(1);
  });

  it('calcula totalPuntos despues de acumular y canjear', () => {
    const store = crearStore(CLIENTE);
    const inicial = store.totalPuntos;
    expect(inicial).toBe(12500);

    expect(store.acreditarCompra('burger-house', 'total-1', 100)).toBe('ok');
    const producto = store.getById('burger-house')!.productos[0];
    expect(store.canjear('burger-house', producto)).toBe('ok');

    expect(store.totalPuntos).toBe(inicial + 100 - producto.puntos);
  });

  it('no destruye el estado cuando la identidad del usuario es __proto__', () => {
    const usuarioProto: SessionUser = { ...CLIENTE, id: '__proto__', correo: 'proto@example.com' };
    const store = crearStore(usuarioProto);

    expect(store.acreditarCompra('burger-house', 'proto-1', 10)).toBe('ok');
    expect(saldo(store, 'burger-house')).toBe(1260);
    expect(store.movimientos).toHaveLength(1);

    expect(store.acreditarCompra('burger-house', 'proto-2', 5)).toBe('ok');
    expect(saldo(store, 'burger-house')).toBe(1265);
    expect(store.movimientos).toHaveLength(2);

    const otroUsuario = crearStore(CLIENTE);
    expect(saldo(otroUsuario, 'burger-house')).toBe(1250);
  });

  it('no otorga puntos gratis con una oferta persistida con puntos negativos', () => {
    const ofertaNegativa: Producto = { nombre: 'Puntos gratis', puntos: -500, imagen: 'assets/img/no-existe.png' };
    localStorage.setItem('snacki.store-offers', JSON.stringify({ 'burger-house': [ofertaNegativa] }));

    const comercio = crearStore(COMERCIO_BURGER);
    expect(comercio.agregarRecompensa('burger-house', 'Otro gratis', -1)).toBe(false);

    const store = crearStore(CLIENTE);
    expect(store.getById('burger-house')?.productos.some((item) => item.nombre === ofertaNegativa.nombre)).toBe(false);

    const saldoAntes = saldo(store, 'burger-house');
    const movimientosAntes = store.movimientos.length;

    expect(store.canjear('burger-house', ofertaNegativa)).toBe('invalido');
    expect(saldo(store, 'burger-house')).toBe(saldoAntes);
    expect(store.movimientos).toHaveLength(movimientosAntes);
  });

  it('rechaza agregar o eliminar recompensas si el usuario no es comercio del local', () => {
    const comercio = crearStore(COMERCIO_BURGER);
    expect(comercio.agregarRecompensa('burger-house', 'Oferta autorizada', 50)).toBe(true);

    const cliente = crearStore(CLIENTE);
    expect(cliente.agregarRecompensa('burger-house', 'Oferta cliente', 50)).toBe(false);
    expect(cliente.eliminarRecompensa('burger-house', 'Oferta autorizada')).toBe(false);
    expect(cliente.getById('burger-house')?.productos.some((item) => item.nombre === 'Oferta autorizada')).toBe(true);

    const otroComercio = crearStore({
      ...COMERCIO_BURGER,
      id: 'com-pizza',
      correo: 'pizza-owner@example.com',
      comercioId: 'pizza-hut',
    });
    expect(otroComercio.eliminarRecompensa('burger-house', 'Oferta autorizada')).toBe(false);

    const comercioRecargado = crearStore(COMERCIO_BURGER);
    expect(comercioRecargado.eliminarRecompensa('burger-house', 'Oferta autorizada')).toBe(true);
    expect(comercioRecargado.getById('burger-house')?.productos.some((item) => item.nombre === 'Oferta autorizada')).toBe(false);
  });

  it('migra los saldos legacy de una sesion sin id y conserva un id estable', () => {
    localStorage.setItem('snacki.point-balances', JSON.stringify({ 'elias@example.com': { 'burger-house': 777 } }));
    localStorage.setItem('snacki.current-user', JSON.stringify({
      nombre: 'Elias',
      correo: 'elias@example.com',
      tipo: 'cliente',
    }));

    TestBed.configureTestingModule({ providers: [AuthService, StoreService] });
    const store = TestBed.inject(StoreService);
    const auth = TestBed.inject(AuthService);

    expect(saldo(store, 'burger-house')).toBe(777);
    expect(auth.currentUser?.id).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('snacki.current-user')!).id).toBe(auth.currentUser?.id);
  });
});
