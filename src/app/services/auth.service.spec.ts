import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

function crearAuth(): AuthService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [AuthService] });
  return TestBed.inject(AuthService);
}

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  afterEach(() => vi.restoreAllMocks());

  it('registra y autentica con el hash demo de la contrasena', () => {
    const auth = crearAuth();

    expect(auth.registrar('Ana Perez', 'ana@example.com', 'secreto123', 'cliente')).toBe(true);
    expect(auth.iniciarSesion('ana@example.com', 'secreto123', 'cliente')).toBe(true);
    expect(auth.currentUser?.correo).toBe('ana@example.com');
    expect(auth.currentUser?.id).toBeTruthy();
  });

  it('rechaza una contrasena incorrecta', () => {
    const auth = crearAuth();

    expect(auth.registrar('Ana Perez', 'ana2@example.com', 'secreto123', 'cliente')).toBe(true);
    expect(auth.iniciarSesion('ana2@example.com', 'incorrecta', 'cliente')).toBe(false);
  });

  it('falla el login cuando el tipo solicitado no coincide con el perfil', () => {
    const auth = crearAuth();

    expect(auth.registrar('Ana Perez', 'ana3@example.com', 'secreto123', 'cliente')).toBe(true);
    expect(auth.iniciarSesion('ana3@example.com', 'secreto123', 'comercio')).toBe(false);
  });

  it('rechaza el registro de comercio sin comercioId', () => {
    const auth = crearAuth();

    expect(auth.registrar('Tienda', 'sin-id@example.com', 'secreto123', 'comercio')).toBe(false);
  });

  it('no restaura una sesion de comercio sin comercioId', () => {
    localStorage.setItem('snacki.current-user', JSON.stringify({
      id: 'com-legacy',
      nombre: 'Tienda Legacy',
      correo: 'legacy-comercio@example.com',
      tipo: 'comercio',
    }));

    const auth = crearAuth();
    expect(auth.currentUser).toBeNull();
  });

  it('persiste id y comercioId al registrar un comercio', () => {
    const auth = crearAuth();

    expect(auth.registrar('Burger House', 'burger@example.com', 'secreto123', 'comercio', 'burger-house')).toBe(true);
    expect(auth.currentUser?.id).toBeTruthy();
    expect(auth.currentUser?.tipo).toBe('comercio');
    expect(auth.currentUser?.comercioId).toBe('burger-house');

    const recargado = crearAuth();
    expect(recargado.currentUser?.id).toBeTruthy();
    expect(recargado.currentUser?.comercioId).toBe('burger-house');
  });

  it('rechaza un correo duplicado entre roles distintos', () => {
    const auth = crearAuth();

    expect(auth.registrar('Cliente', 'duplicado@example.com', 'secreto123', 'cliente')).toBe(true);
    expect(auth.registrar('Comercio', 'duplicado@example.com', 'secreto123', 'comercio', 'burger-house')).toBe(false);
  });

  it('normaliza una sesion legacy sin id', () => {
    localStorage.setItem('snacki.current-user', JSON.stringify({
      nombre: 'Legacy User',
      correo: 'legacy@example.com',
      tipo: 'cliente',
    }));

    const auth = crearAuth();

    expect(auth.currentUser).not.toBeNull();
    expect(typeof auth.currentUser?.id).toBe('string');
    expect(auth.currentUser?.id).toBeTruthy();
    expect(auth.currentUser?.nombre).toBe('Legacy User');
  });
});
