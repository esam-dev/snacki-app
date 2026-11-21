import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

type TipoSesion = 'cliente' | 'comercio';

function mockAuth(user: { tipo: TipoSesion; comercioId?: string } | null) {
  return {
    ensureSessionResolved: vi.fn().mockResolvedValue(undefined),
    currentUser: user ? {
      id: `user-${user.tipo}`,
      nombre: user.tipo === 'comercio' ? 'Tienda Demo' : 'Cliente Demo',
      correo: `${user.tipo}@example.com`,
      tipo: user.tipo,
      ...(user.comercioId ? { comercioId: user.comercioId } : {}),
    } : null,
  } as unknown as AuthService;
}

function configurar(user: { tipo: TipoSesion; comercioId?: string } | null): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: mockAuth(user) },
    ],
  });
}

async function ejecutarGuard(tipo: TipoSesion, url: string): Promise<boolean | UrlTree> {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  const result = TestBed.runInInjectionContext(() => roleGuard(tipo)(route, state));
  return await Promise.resolve(result as any);
}

function esperarRedirectLogin(resultado: boolean | UrlTree, url: string): void {
  expect(resultado).toBeInstanceOf(UrlTree);
  const tree = resultado as UrlTree;
  expect(tree.toString().startsWith('/login')).toBe(true);
  expect(tree.queryParams['returnUrl']).toBe(url);
}

describe('roleGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it('permite a un cliente entrar a /tabs', async () => {
    configurar({ tipo: 'cliente' });
    expect(await ejecutarGuard('cliente', '/tabs')).toBe(true);
  });

  it('redirige a un cliente que intenta entrar a /comercio hacia su home', async () => {
    configurar({ tipo: 'cliente' });
    const result = await ejecutarGuard('comercio', '/comercio');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/tabs/home');
  });

  it('permite a un comercio entrar a /comercio', async () => {
    configurar({ tipo: 'comercio', comercioId: 'burger-house' });
    expect(await ejecutarGuard('comercio', '/comercio')).toBe(true);
  });

  it('redirige a un comercio que intenta entrar a /tabs hacia su home', async () => {
    configurar({ tipo: 'comercio', comercioId: 'burger-house' });
    const result = await ejecutarGuard('cliente', '/tabs');
    expect(result).toBeInstanceOf(UrlTree);
    expect((result as UrlTree).toString()).toBe('/comercio');
  });

  it('redirige a /login cuando no hay sesion', async () => {
    configurar(null);
    esperarRedirectLogin(await ejecutarGuard('cliente', '/tabs/puntos'), '/tabs/puntos');
  });
});
