import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
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

  describe('catálogo del servidor', () => {
    const URL_CATALOGO = `${environment.apiBaseUrl}/api/catalog/tenants`;

    it('refleja en el cliente las promos, recompensas, logo y vencimiento que publica el comercio', async () => {
      const store = crearStore(CLIENTE);
      const httpMock = TestBed.inject(HttpTestingController);

      const promesa = store.refrescarCatalogo();
      httpMock.expectOne(URL_CATALOGO).flush({
        data: {
          tenants: [{
            id: 't1', slug: 'burger-house', name: 'Burger House', category: 'comida_rapida', address: null,
            logoUrl: '/api/catalog/images/tenant/t1?v=1', pointsExpireAt: '2027-03-01T00:00:00.000Z',
            products: [{
              id: 'p1', name: 'Combo nuevo', description: null, points: 300, imageUrl: null,
              promoStartsAt: '2026-11-01T00:00:00.000Z', promoEndsAt: '2026-12-31T00:00:00.000Z',
            }],
            rewards: [{ id: 'r1', name: 'Papas gratis', description: null, cost: 600, imageUrl: '/api/catalog/images/reward/r1?v=2' }],
          }],
        },
      });

      expect(await promesa).toBe(true);
      const local = store.getById('burger-house');
      expect(local?.nombre).toBe('Burger House');
      expect(local?.logo).toBe(`${environment.apiBaseUrl}/api/catalog/images/tenant/t1?v=1`);
      // El vencimiento mostrado es el de los puntos del cliente (wallet); sin puntos, no hay fecha.
      expect(local?.vencimiento).toBe('');
      expect(local?.promos.map((p) => p.nombre)).toEqual(['Combo nuevo']);
      expect(local?.productos.map((p) => p.nombre)).toEqual(['Papas gratis']);
      expect(local?.productos[0]?.imagen).toBe(`${environment.apiBaseUrl}/api/catalog/images/reward/r1?v=2`);
      // Con catálogo real el saldo sale de la wallet del servidor: sin wallet aún, 0 (nunca el de demostración).
      expect(local?.puntos).toBe(0);
      expect(store.getById('pizza-hut')).toBeUndefined(); // ya no está en el catálogo del servidor
    });

    it('con wallet del servidor muestra saldo, vencimiento, progreso y movimientos reales', async () => {
      const store = crearStore(CLIENTE);
      const httpMock = TestBed.inject(HttpTestingController);

      const promesa = store.refrescar();
      httpMock.expectOne(URL_CATALOGO).flush({
        data: { tenants: [
          { id: 't1', slug: 'burger-house', name: 'Burger House', category: 'comida_rapida', address: null, logoUrl: null, pointsExpireAt: null, products: [], rewards: [{ id: 'r1', name: 'Papas gratis', description: null, cost: 600, imageUrl: null }] },
          { id: 't2', slug: 'cafe-central', name: 'Café Central', category: 'cafe', address: null, logoUrl: null, pointsExpireAt: null, products: [], rewards: [] },
        ] },
      });
      httpMock.expectOne(`${environment.apiBaseUrl}/api/wallet`).flush({
        data: {
          totalPoints: 450,
          updatedAt: '2026-11-25T12:00:00.000Z',
          tenants: [{
            tenantId: 't1', slug: 'burger-house', name: 'Burger House', balance: 450,
            nextExpiresAt: '2027-01-24T00:00:00.000Z', nextExpiringPoints: 450, redeemableRewards: 0,
            nextReward: { id: 'r1', name: 'Papas gratis', cost: 600, missing: 150, progress: 0.75 },
          }],
        },
      });
      httpMock.expectOne(`${environment.apiBaseUrl}/api/wallet/movements`).flush({
        data: { movements: [
          { id: 'm1', tenantSlug: 'burger-house', tenantName: 'Burger House', type: 'EARN', points: 450, description: 'Combo', createdAt: '2026-11-25T10:00:00.000Z', expired: false },
          { id: 'm2', tenantSlug: 'cafe-central', tenantName: 'Café Central', type: 'EARN', points: 300, description: 'Puntos acumulados', createdAt: '2026-10-01T10:00:00.000Z', expired: true },
        ] },
      });
      await promesa;

      expect(store.usaWallet).toBe(true);
      const burger = store.getById('burger-house');
      expect(burger?.puntos).toBe(450);
      expect(burger?.vencimiento).toBe('2027-01-24');
      expect(burger?.siguienteRecompensa).toMatchObject({ nombre: 'Papas gratis', faltan: 150, progreso: 0.75 });
      expect(store.getById('cafe-central')?.puntos).toBe(0);
      expect(store.totalPuntos).toBe(450);
      expect(store.movimientos.map((m) => m.id)).toEqual(['m1', 'm2']);
      expect(store.movimientos[1]?.vencido).toBe(true);
      httpMock.verify();
    });

    it('si el servidor falla se mantiene el último catálogo conocido', async () => {
      const store = crearStore(CLIENTE);
      const httpMock = TestBed.inject(HttpTestingController);

      const promesa = store.refrescarCatalogo();
      httpMock.expectOne(URL_CATALOGO).flush({ error: {} }, { status: 500, statusText: 'Server Error' });

      expect(await promesa).toBe(false);
      expect(store.getById('burger-house')?.productos.length).toBeGreaterThan(0);
    });
  });
});
