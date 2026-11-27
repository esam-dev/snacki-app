import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '../../environments/environment';
import { MerchantService } from './merchant.service';

const BASE = `${environment.apiBaseUrl}/api/merchant`;

describe('MerchantService · canjes y estadísticas', () => {
  let service: MerchantService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [MerchantService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(MerchantService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide las estadísticas del período elegido', async () => {
    const promesa = service.getStats('7d');
    const req = http.expectOne((r) => r.url === `${BASE}/stats`);
    expect(req.request.params.get('range')).toBe('7d');
    req.flush({ data: { range: '7d', pointsIssued: 120, uniqueCustomers: 3 } });
    expect(await promesa).toMatchObject({ range: '7d', pointsIssued: 120, uniqueCustomers: 3 });
  });

  it('pagina los canjes con el cursor de la página anterior', async () => {
    const primera = service.listRedemptions({ limit: 20 });
    const req1 = http.expectOne((r) => r.url === `${BASE}/redemptions`);
    expect(req1.request.params.get('limit')).toBe('20');
    expect(req1.request.params.has('before')).toBe(false);
    req1.flush({ data: { redemptions: [{ id: 'r1' }], nextCursor: 'r1' } });
    const { nextCursor } = await primera;
    expect(nextCursor).toBe('r1');

    const segunda = service.listRedemptions({ limit: 20, before: nextCursor! });
    const req2 = http.expectOne((r) => r.url === `${BASE}/redemptions`);
    expect(req2.request.params.get('before')).toBe('r1');
    req2.flush({ data: { redemptions: [{ id: 'r2' }], nextCursor: null } });
    expect((await segunda).redemptions.map((r) => r.id)).toEqual(['r2']);
  });
});
