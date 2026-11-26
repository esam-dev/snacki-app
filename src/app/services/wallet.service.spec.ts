import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';
import { WalletService, esQrDeCanje, esQrDeCompra } from './wallet.service';

class TokenStorageServiceMock {
  async setToken(): Promise<void> {}
  async getToken(): Promise<string | null> { return null; }
  async clear(): Promise<void> {}
}

const API = environment.apiBaseUrl;

function crear(role: 'cliente' | 'comercio' = 'cliente') {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [AuthService, WalletService, { provide: TokenStorageService, useClass: TokenStorageServiceMock }, provideHttpClient(), provideHttpClientTesting()],
  });
  const auth = TestBed.inject(AuthService);
  (auth as any)._currentUser.set({ id: 'u1', role, tipo: role, nombre: 'Test', correo: 't@x.cl' });
  (auth as any).authStatus.set('authenticated');
  return { wallet: TestBed.inject(WalletService), http: TestBed.inject(HttpTestingController) };
}

function flushWallet(http: HttpTestingController, balance: number) {
  http.expectOne(`${API}/api/wallet`).flush({
    data: { totalPoints: balance, updatedAt: '2026-11-25T12:00:00.000Z', tenants: [{ tenantId: 't1', slug: 'burger-house', name: 'Burger House', balance, nextExpiresAt: null, nextExpiringPoints: 0, redeemableRewards: 0, nextReward: null }] },
  });
  http.expectOne(`${API}/api/wallet/movements`).flush({ data: { movements: [] } });
}

const tick = () => new Promise((r) => setTimeout(r));

describe('esQrDeCompra', () => {
  it('reconoce el QR firmado del comercio', () => {
    expect(esQrDeCompra('snacki://claim/S1.abc.123.sig')).toBe(true);
    expect(esQrDeCompra('  S1.abc.123.sig ')).toBe(true);
    expect(esQrDeCompra('snacki://local/burger-house')).toBe(false);
    expect(esQrDeCompra('https://evil.example/claim')).toBe(false);
    expect(esQrDeCompra('snacki://redeem/R1.abc.123.sig')).toBe(false);
  });

  it('reconoce el QR de canje y no lo confunde con uno de compra', () => {
    expect(esQrDeCanje('snacki://redeem/R1.abc.123.sig')).toBe(true);
    expect(esQrDeCanje('R1.abc.123.sig')).toBe(true);
    expect(esQrDeCanje('snacki://claim/S1.abc.123.sig')).toBe(false);
  });
});

describe('WalletService', () => {
  beforeEach(() => localStorage.clear());

  it('escanear: envía el QR al servidor y devuelve el saldo actualizado del comercio', async () => {
    const { wallet, http } = crear();
    const promesa = wallet.escanear('snacki://claim/S1.x.y.z');
    const req = http.expectOne(`${API}/api/claims`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'snacki://claim/S1.x.y.z' });
    req.flush({ data: { points: 120, tenant: { id: 't1', name: 'Burger House' } } }, { status: 201, statusText: 'Created' });
    await tick();
    flushWallet(http, 570);

    expect(await promesa).toEqual({ ok: true, puntos: 120, comercio: 'Burger House', comercioId: 'burger-house', saldo: 570 });
    expect(wallet.comercio('burger-house')?.saldo).toBe(570);
    http.verify();
  });

  it('escanear: muestra el mensaje del servidor cuando el QR ya fue usado', async () => {
    const { wallet, http } = crear();
    const promesa = wallet.escanear('S1.x.y.z');
    http.expectOne(`${API}/api/claims`).flush({ error: { code: 'QR_ALREADY_USED', message: 'Este QR ya fue usado.' } }, { status: 409, statusText: 'Conflict' });
    expect(await promesa).toEqual({ ok: false, codigo: 'QR_ALREADY_USED', mensaje: 'Este QR ya fue usado.' });
    http.verify();
  });

  it('escanear sin conexión: mensaje claro', async () => {
    const { wallet, http } = crear();
    const promesa = wallet.escanear('S1.x.y.z');
    http.expectOne(`${API}/api/claims`).error(new ProgressEvent('error'), { status: 0 });
    const r = await promesa;
    expect(r.ok === false && r.codigo).toBe('NETWORK_ERROR');
  });

  it('una cuenta de comercio no consulta la wallet', async () => {
    const { wallet, http } = crear('comercio');
    expect(await wallet.refrescar()).toBe(false);
    http.expectNone(`${API}/api/wallet`);
    expect(wallet.datos).toBeNull();
  });

  it('canje: la vista previa no descuenta y el canje confirma con el servidor', async () => {
    const { wallet, http } = crear();
    const previa = wallet.previsualizarCanje('snacki://redeem/R1.x.y.z');
    http.expectOne(`${API}/api/redemptions/preview`).flush({
      data: { reward: { name: 'Papas' }, tenant: { slug: 'burger-house', name: 'Burger House' }, cost: 600, balance: 900, enough: true },
    });
    expect(await previa).toEqual({ ok: true, vista: { recompensa: 'Papas', comercio: 'Burger House', comercioId: 'burger-house', costo: 600, saldo: 900, alcanza: true } });
    http.expectNone(`${API}/api/redemptions`);

    const canje = wallet.canjear('snacki://redeem/R1.x.y.z');
    http.expectOne(`${API}/api/redemptions`).flush({ data: { code: 'ABCD2345', cost: 600, balance: 300, reward: { name: 'Papas' }, tenant: { name: 'Burger House' } } }, { status: 201, statusText: 'Created' });
    await tick();
    flushWallet(http, 300);
    expect(await canje).toEqual({ ok: true, recompensa: 'Papas', comercio: 'Burger House', costo: 600, saldo: 300, codigo: 'ABCD2345' });
    http.verify();
  });

  it('canje sin saldo suficiente: muestra el mensaje del servidor', async () => {
    const { wallet, http } = crear();
    const canje = wallet.canjear('R1.x.y.z');
    http.expectOne(`${API}/api/redemptions`).flush({ error: { code: 'INSUFFICIENT_POINTS', message: 'Te faltan 100 puntos en este comercio para esta recompensa.' } }, { status: 409, statusText: 'Conflict' });
    expect(await canje).toEqual({ ok: false, codigo: 'INSUFFICIENT_POINTS', mensaje: 'Te faltan 100 puntos en este comercio para esta recompensa.' });
  });

  it('guarda la wallet por usuario para verla sin conexión', async () => {
    const { wallet, http } = crear();
    const promesa = wallet.refrescar();
    flushWallet(http, 300);
    expect(await promesa).toBe(true);
    expect(localStorage.getItem('snacki.wallet.u1')).toContain('burger-house');
  });
});
