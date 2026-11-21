import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { Producto, StoreService } from './store.service';
import { TokenStorageService } from './token-storage.service';

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

class TokenStorageServiceMock {
  async setToken(): Promise<void> {}
  async getToken(): Promise<string | null> { return null; }
  async clear(): Promise<void> {}
}

function setAuthUser(auth: AuthService, user: SessionUser): void {
  const sessionUser = {
    id: user.id,
    fullName: user.nombre,
    email: user.correo,
    role: user.tipo,
    tenantId: user.comercioId || 'tenant-platform',
    tenantSlug: user.comercioId || 'snacki',
    tenantName: user.tipo === 'comercio' ? user.nombre : 'Snacki',
    nombre: user.nombre,
    correo: user.correo,
    tipo: user.tipo,
    ...(user.comercioId ? { comercioId: user.comercioId } : {}),
  };
  (auth as any)._currentUser.set(sessionUser);
  (auth as any).authStatus.set('authenticated');
}

function crearStore(user: SessionUser): StoreService {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      AuthService,
      StoreService,
      { provide: TokenStorageService, useClass: TokenStorageServiceMock },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  const auth = TestBed.inject(AuthService);
  setAuthUser(auth, user);
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

  it('rechaza el canje cuando el saldo es insuficiente y no modifica el estado', () => {
    const store = crearStore(CLIENTE);
    const producto = store.getById('burger-house')?.productos.find((item) => item.nombre === 'Recompensa costosa');
    if (!producto) {
      const comercio = crearStore(COMERCIO_BURGER);
      expect(comercio.agregarRecompensa('burger-house', 'Recompensa costosa', 9999)).toBe(true);
    }
    const cliente = crearStore(CLIENTE);
    const caro = cliente.getById('burger-house')?.productos.find((item) => item.nombre === 'Recompensa costosa') || { nombre: 'X', puntos: 9999, imagen: 'assets/img/prod-combo-bacon.jpg' };
    const saldoAntes = saldo(cliente, 'burger-house');
    expect(cliente.canjear('burger-house', caro as Producto)).toBe('saldo-insuficiente');
    expect(saldo(cliente, 'burger-house')).toBe(saldoAntes);
  });

  it('permite a un comercio autorizado agregar y eliminar recompensas', () => {
    const comercio = crearStore(COMERCIO_BURGER);
    expect(comercio.agregarRecompensa('burger-house', 'Oferta autorizada', 150)).toBe(true);
    expect(comercio.getById('burger-house')?.productos.some((item) => item.nombre === 'Oferta autorizada')).toBe(true);
    expect(comercio.eliminarRecompensa('burger-house', 'Oferta autorizada')).toBe(true);
  });

  it('impide que un cliente modifique el catálogo del comercio', () => {
    const cliente = crearStore(CLIENTE);
    expect(cliente.agregarRecompensa('burger-house', 'Oferta no autorizada', 150)).toBe(false);
  });
});
