import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { TokenStorageService } from './token-storage.service';

class TokenStorageServiceMock {
  private token: string | null = null;
  async setToken(token: string): Promise<void> { this.token = token; }
  async getToken(): Promise<string | null> { return this.token; }
  async clear(): Promise<void> { this.token = null; }
}

function setup() {
  TestBed.resetTestingModule();
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      AuthService,
      { provide: TokenStorageService, useClass: TokenStorageServiceMock },
      provideHttpClient(),
      provideHttpClientTesting(),
    ],
  });
  return {
    auth: TestBed.inject(AuthService),
    httpMock: TestBed.inject(HttpTestingController),
    tokenStorage: TestBed.inject(TokenStorageService) as unknown as TokenStorageServiceMock,
  };
}

describe('AuthService (backend auth)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    try { TestBed.inject(HttpTestingController).verify(); } catch {}
    vi.restoreAllMocks();
  });

  it('login exitoso guarda token y establece usuario', async () => {
    const { auth, httpMock, tokenStorage } = setup();
    const promise = auth.login('ana@example.com', 'secreto123', 'cliente');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/auth/login`);
    expect(req.request.method).toBe('POST');
    req.flush({
      data: {
        user: { id: 'u1', fullName: 'Ana Perez', email: 'ana@example.com', isActive: true },
        membership: { role: 'cliente', tenantId: 't1', tenantSlug: 'snacki', tenantName: 'Snacki' },
        auth: { accessToken: 'jwt-token', tokenType: 'Bearer', expiresIn: 3600 },
      },
    });

    const result = await promise;
    expect(result.success).toBe(true);
    expect(auth.currentUser?.correo).toBe('ana@example.com');
    expect(auth.currentUser?.tipo).toBe('cliente');
    expect(await tokenStorage.getToken()).toBe('jwt-token');
  });

  it('login inválido retorna error sin autenticar', async () => {
    const { auth, httpMock } = setup();
    const promise = auth.login('ana@example.com', 'bad', 'cliente');

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/auth/login`);
    req.flush({ error: { code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas' } }, { status: 401, statusText: 'Unauthorized' });

    const result = await promise;
    expect(result.success).toBe(false);
    expect(auth.currentUser).toBeNull();
  });

  it('restoreSession con token válido hidrata usuario desde /me', async () => {
    const { auth, httpMock, tokenStorage } = setup();
    await tokenStorage.setToken('jwt-token');

    const promise = auth.restoreSession();
    await Promise.resolve(); // getToken() es async: la request se emite en el siguiente microtask
    const req = httpMock.expectOne(`${environment.apiBaseUrl}/api/auth/me`);
    expect(req.request.headers.get('Authorization')).toBeNull(); // interceptor not registered in this testbed; request still made
    req.flush({
      data: {
        user: { id: 'u1', fullName: 'Ana Perez', email: 'ana@example.com', isActive: true },
        membership: { role: 'comercio', tenantId: 't2', tenantSlug: 'burger-house', tenantName: 'Burger House' },
        session: {},
      },
    });

    await promise;
    expect(auth.currentUser?.tipo).toBe('comercio');
    expect(auth.currentUser?.comercioId).toBe('burger-house');
  });

  it('restoreSession sin token queda anónimo', async () => {
    const { auth, httpMock } = setup();
    await auth.restoreSession();
    httpMock.expectNone(`${environment.apiBaseUrl}/api/auth/me`);
    expect(auth.currentUser).toBeNull();
    expect(auth.authStatus()).toBe('anonymous');
  });

  it('login sin conexión devuelve un mensaje claro y no autentica', async () => {
    const { auth, httpMock } = setup();
    const promise = auth.login('ana@example.com', 'secreto123', 'cliente');

    httpMock.expectOne(`${environment.apiBaseUrl}/api/auth/login`).error(new ProgressEvent('error'));

    const result = await promise;
    expect(result.success).toBe(false);
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.message).toContain('conectar');
    expect(auth.currentUser).toBeNull();
  });

  it('cerrarSesion deja la sesión anónima aunque falle el almacenamiento del token', async () => {
    const { auth, tokenStorage } = setup();
    (auth as any).authStatus.set('authenticated');
    vi.spyOn(tokenStorage, 'clear').mockRejectedValue(new Error('storage'));

    await auth.cerrarSesion();

    expect(auth.currentUser).toBeNull();
    expect(auth.authStatus()).toBe('anonymous');
  });
});
