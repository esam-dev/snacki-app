import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { ReferralsService } from './referrals.service';
import { TokenStorageService } from './token-storage.service';

class TokenStorageServiceMock {
  async setToken(): Promise<void> {}
  async getToken(): Promise<string | null> { return null; }
  async clear(): Promise<void> {}
}

const API = environment.apiBaseUrl;
const tick = () => new Promise((r) => setTimeout(r));

const TENANT = {
  tenantId: 't1', slug: 'burger-house', name: 'Burger House', logoUrl: '/api/catalog/images/tenant/t1?v=1', code: 'K7M2QXA',
  referrerBonusPoints: 100, refereeBonusPoints: 50, maxReferrals: 10, remainingInvites: 9,
  pending: 1, completed: 0, bonusEarned: 0, referredBy: null,
};

function crear(role: 'cliente' | 'comercio' = 'cliente') {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [AuthService, ReferralsService, { provide: TokenStorageService, useClass: TokenStorageServiceMock }, provideHttpClient(), provideHttpClientTesting()],
  });
  const auth = TestBed.inject(AuthService);
  (auth as any)._currentUser.set({ id: 'u1', role, tipo: role, nombre: 'Test', correo: 't@x.cl' });
  (auth as any).authStatus.set('authenticated');
  return { referrals: TestBed.inject(ReferralsService), http: TestBed.inject(HttpTestingController) };
}

describe('ReferralsService', () => {
  beforeEach(() => localStorage.clear());

  it('refrescar: mapea mis códigos y los deja en caché para verlos sin conexión', async () => {
    const { referrals, http } = crear();
    const promesa = referrals.refrescar();
    http.expectOne(`${API}/api/referrals/me`).flush({ data: { tenants: [TENANT] } });
    expect(await promesa).toBe(true);

    const c = referrals.datos!.comercios[0];
    expect(c).toMatchObject({ slug: 'burger-house', codigo: 'K7M2QXA', bonoInvita: 100, bonoInvitado: 50, pendientes: 1, restantes: 9 });
    expect(c.logo).toBe(`${API}/api/catalog/images/tenant/t1?v=1`);
    expect(localStorage.getItem('snacki.referrals.u1')).toContain('K7M2QXA');
  });

  it('aplicar: envía el código y refresca el estado', async () => {
    const { referrals, http } = crear();
    const promesa = referrals.aplicar(' k7m2qxa ');
    const req = http.expectOne(`${API}/api/referrals/apply`);
    expect(req.request.body).toEqual({ code: 'k7m2qxa' });
    req.flush({ data: { tenant: { id: 't1', name: 'Burger House' }, referrerName: 'Ana', refereeBonusPoints: 50 } }, { status: 201, statusText: 'Created' });
    await tick();
    http.expectOne(`${API}/api/referrals/me`).flush({ data: { tenants: [TENANT] } });
    expect(await promesa).toEqual({ ok: true, comercio: 'Burger House', comercioId: 'burger-house', invita: 'Ana', bonoInvitado: 50 });
  });

  it('aplicar: muestra el motivo del servidor y avisa si no hay conexión', async () => {
    const { referrals, http } = crear();
    const rechazo = referrals.aplicar('ABC1234');
    http.expectOne(`${API}/api/referrals/apply`).flush(
      { error: { code: 'REFERRAL_EXISTING_CLIENT', message: 'Ya eres cliente de este comercio: los códigos son para clientes nuevos.' } },
      { status: 409, statusText: 'Conflict' },
    );
    expect(await rechazo).toMatchObject({ ok: false, codigo: 'REFERRAL_EXISTING_CLIENT', mensaje: expect.stringContaining('Ya eres cliente') });

    const sinRed = referrals.aplicar('ABC1234');
    http.expectOne(`${API}/api/referrals/apply`).error(new ProgressEvent('error'), { status: 0 });
    expect(await sinRed).toMatchObject({ ok: false, codigo: 'NETWORK_ERROR' });
  });

  it('una cuenta de comercio no usa referidos', async () => {
    const { referrals, http } = crear('comercio');
    expect(await referrals.refrescar()).toBe(false);
    expect((await referrals.aplicar('ABC1234')).ok).toBe(false);
    http.expectNone(`${API}/api/referrals/me`);
  });
});
