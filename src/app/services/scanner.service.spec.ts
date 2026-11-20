import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScannerService } from './scanner.service';

describe('ScannerService', () => {
  let service: ScannerService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ScannerService] });
    service = TestBed.inject(ScannerService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('extrae una compra con el formato de demostracion', () => {
    expect(service.extraerCompra('snacki://purchase/burger-house?id=compra-demo-001&points=25')).toEqual({
      localId: 'burger-house',
      purchaseId: 'compra-demo-001',
      puntos: 25,
    });
  });

  it('acepta los limites de puntos y un localId con guiones y digitos', () => {
    expect(service.extraerCompra('snacki://purchase/local-123?id=abc&points=1')).toEqual({
      localId: 'local-123',
      purchaseId: 'abc',
      puntos: 1,
    });
    expect(service.extraerCompra('snacki://purchase/pizza-hut?id=abc&points=100000')).toEqual({
      localId: 'pizza-hut',
      purchaseId: 'abc',
      puntos: 100000,
    });
  });

  it('acepta un purchaseId de 120 caracteres', () => {
    const purchaseId = 'a'.repeat(120);
    expect(service.extraerCompra(`snacki://purchase/burger-house?id=${purchaseId}&points=10`)?.purchaseId).toBe(purchaseId);
  });

  it('rechaza puntos en notacion cientifica, hexadecimal, negativos, cero, decimales, fuera de rango y no numericos', () => {
    const invalidos = [
      'snacki://purchase/burger-house?id=p&points=1e3',
      'snacki://purchase/burger-house?id=p&points=0x10',
      'snacki://purchase/burger-house?id=p&points=-5',
      'snacki://purchase/burger-house?id=p&points=0',
      'snacki://purchase/burger-house?id=p&points=100001',
      'snacki://purchase/burger-house?id=p&points=10.5',
      'snacki://purchase/burger-house?id=p&points=abc',
      'snacki://purchase/burger-house?id=p',
    ];

    for (const valor of invalidos) {
      expect(service.extraerCompra(valor)).toBeNull();
    }
  });

  it('rechaza esquema, host, localId o purchaseId incorrectos', () => {
    const purchaseIdLargo = 'a'.repeat(121);
    const invalidos = [
      'https://purchase/burger-house?id=p&points=10',
      'snacki://local/burger-house?id=p&points=10',
      'snacki://purchase/burger_house?id=p&points=10',
      `snacki://purchase/burger-house?id=${purchaseIdLargo}&points=10`,
      'snacki://purchase/burger-house?id=&points=10',
      '',
      'texto libre',
    ];

    for (const valor of invalidos) {
      expect(service.extraerCompra(valor)).toBeNull();
    }
  });

  it('extrae el localId de un QR informativo valido', () => {
    expect(service.extraerLocalId('snacki://local/burger-house')).toBe('burger-house');
    expect(service.extraerLocalId('snacki://local/local-123')).toBe('local-123');
  });

  it('rechaza QR informativos con otro esquema, otro host o identificador invalido', () => {
    const invalidos = [
      'snacki://purchase/burger-house',
      'snacki://local/burger_house',
      'snacki://local/',
      'https://local/burger-house',
      'snacki://local/burger-house?x=1',
    ];

    for (const valor of invalidos) {
      expect(service.extraerLocalId(valor)).toBeNull();
    }
  });
});
