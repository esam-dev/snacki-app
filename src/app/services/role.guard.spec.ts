import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

type TipoSesion = 'cliente' | 'comercio';

function configurarSesion(tipo?: TipoSesion): void {
  TestBed.resetTestingModule();

  if (tipo) {
    localStorage.setItem('snacki.current-user', JSON.stringify({
      id: `user-${tipo}`,
      nombre: tipo === 'comercio' ? 'Tienda Demo' : 'Cliente Demo',
      correo: `${tipo}@example.com`,
      tipo,
      ...(tipo === 'comercio' ? { comercioId: 'burger-house' } : {}),
    }));
  } else {
    localStorage.removeItem('snacki.current-user');
  }

  TestBed.configureTestingModule({ providers: [AuthService, provideRouter([])] });
}

function ejecutarGuard(tipo: TipoSesion, url: string): boolean | UrlTree {
  const route = {} as ActivatedRouteSnapshot;
  const state = { url } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => roleGuard(tipo)(route, state)) as boolean | UrlTree;
}

function esperarRedirect(resultado: boolean | UrlTree, url: string): void {
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

  it('permite a un cliente entrar a /tabs', () => {
    configurarSesion('cliente');
    expect(ejecutarGuard('cliente', '/tabs')).toBe(true);
  });

  it('redirige a un cliente que intenta entrar a /comercio con returnUrl', () => {
    configurarSesion('cliente');
    esperarRedirect(ejecutarGuard('comercio', '/comercio'), '/comercio');
  });

  it('permite a un comercio entrar a /comercio', () => {
    configurarSesion('comercio');
    expect(ejecutarGuard('comercio', '/comercio')).toBe(true);
  });

  it('redirige a un comercio que intenta entrar a /tabs con returnUrl', () => {
    configurarSesion('comercio');
    esperarRedirect(ejecutarGuard('cliente', '/tabs'), '/tabs');
  });

  it('redirige a /login cuando no hay sesion', () => {
    configurarSesion();
    esperarRedirect(ejecutarGuard('cliente', '/tabs/puntos'), '/tabs/puntos');
  });
});
