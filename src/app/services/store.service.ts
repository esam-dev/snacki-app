import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';

export interface Producto {
  nombre: string;
  puntos: number;
  imagen: string;
}

export interface Local {
  id: string;
  nombre: string;
  logo: string;
  puntos: number;
  vencimiento: string;
  productos: Producto[];
}

export interface MovimientoPuntos {
  id: string;
  localId: string;
  local: string;
  tipo: 'acumulacion' | 'canje';
  descripcion: string;
  puntos: number;
  fecha: string;
}

const MOVIMIENTOS_KEY = 'snacki.point-movements';
const SALDOS_KEY = 'snacki.point-balances';
const OFERTAS_KEY = 'snacki.store-offers';

/** Estado local para la demo; en producción los saldos deben venir del backend. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private auth = inject(AuthService);
  private readonly locales: Local[] = [
    { id: 'burger-house', nombre: 'Burger House', logo: 'assets/img/logo-burger-house.png', puntos: 1250, vencimiento: '2027-01-01', productos: [
      { nombre: 'Combo Bacon Burger', puntos: 600, imagen: 'assets/img/prod-combo-bacon.jpg' },
      { nombre: 'Helado de Vainilla', puntos: 100, imagen: 'assets/img/prod-helado.jpg' },
      { nombre: 'Nuggets de Pollo', puntos: 300, imagen: 'assets/img/prod-nuggets.jpg' },
      { nombre: 'Ensalada Cesar', puntos: 400, imagen: 'assets/img/prod-ensalada.jpg' },
    ] },
    { id: 'pizza-hut', nombre: 'Pizza Hut', logo: 'assets/img/logo-pizza-hut.png', puntos: 6250, vencimiento: '2027-01-03', productos: [] },
    { id: 'quattro-d', nombre: 'Quattro d', logo: 'assets/img/logo-quattro-d.png', puntos: 3000, vencimiento: '2027-01-02', productos: [] },
    { id: 'spaghettoteca', nombre: 'Spaghettoteca', logo: 'assets/img/logo-spaghettoteca.png', puntos: 2000, vencimiento: '2027-01-05', productos: [] },
  ];

  getAll(): Local[] {
    return this.locales.map((local) => ({ ...local, puntos: this.getSaldo(local.id), productos: this.getProductos(local) }));
  }

  getById(id: string | null | undefined): Local | undefined {
    const local = this.locales.find((item) => item.id === id);
    return local ? { ...local, puntos: this.getSaldo(local.id), productos: this.getProductos(local) } : undefined;
  }

  buscar(texto: string): Local[] {
    const q = texto.trim().toLowerCase();
    return this.getAll().filter((local) => !q || local.nombre.toLowerCase().includes(q));
  }

  get totalPuntos(): number {
    return this.getAll().reduce((sum, local) => sum + local.puntos, 0);
  }

  get movimientos(): MovimientoPuntos[] {
    return this.leerMovimientos().sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  /** Acredita un QR de demostración una sola vez por identificador de compra. */
  acreditarCompra(localId: string, purchaseId: string, puntos: number): 'ok' | 'duplicado' | 'invalido' {
    const local = this.locales.find((item) => item.id === localId);
    if (!local || !purchaseId || !Number.isSafeInteger(puntos) || puntos <= 0 || puntos > 100000) return 'invalido';
    const movimientos = this.leerMovimientos();
    if (movimientos.some((item) => item.id === purchaseId)) return 'duplicado';
    this.guardarMovimiento({ id: purchaseId, localId, local: local.nombre, tipo: 'acumulacion', descripcion: 'Puntos por compra', puntos, fecha: new Date().toISOString() });
    this.guardarSaldo(localId, this.getSaldo(localId) + puntos);
    return 'ok';
  }

  canjear(localId: string, producto: Producto): 'ok' | 'saldo-insuficiente' | 'invalido' {
    const local = this.locales.find((item) => item.id === localId);
    if (!local || !this.getProductos(local).some((item) => item.nombre === producto.nombre && item.puntos === producto.puntos)) return 'invalido';
    const saldo = this.getSaldo(localId);
    if (saldo < producto.puntos) return 'saldo-insuficiente';
    this.guardarSaldo(localId, saldo - producto.puntos);
    this.guardarMovimiento({ id: `redeem-${Date.now()}-${Math.random().toString(36).slice(2)}`, localId, local: local.nombre, tipo: 'canje', descripcion: producto.nombre, puntos: producto.puntos, fecha: new Date().toISOString() });
    return 'ok';
  }

  agregarRecompensa(localId: string, nombre: string, puntos: number): boolean {
    const local = this.locales.find((item) => item.id === localId);
    const cleanName = nombre.trim();
    if (!local || !cleanName || cleanName.length > 60 || !Number.isSafeInteger(puntos) || puntos < 1 || puntos > 100000) return false;
    const ofertas = this.leerOfertas();
    if (this.getProductos(local).some((item) => item.nombre.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return false;
    ofertas[localId] = [...(ofertas[localId] || []), { nombre: cleanName, puntos, imagen: 'assets/img/prod-combo-bacon.jpg' }];
    this.guardarOfertas(ofertas);
    return true;
  }

  eliminarRecompensa(localId: string, nombre: string): boolean {
    const local = this.locales.find((item) => item.id === localId);
    if (!local || local.productos.some((item) => item.nombre === nombre)) return false;
    const ofertas = this.leerOfertas();
    const actualizadas = (ofertas[localId] || []).filter((item) => item.nombre !== nombre);
    if (actualizadas.length === (ofertas[localId] || []).length) return false;
    ofertas[localId] = actualizadas;
    this.guardarOfertas(ofertas);
    return true;
  }

  private usuarioKey(): string {
    return (this.auth.currentUser?.correo || this.auth.currentUser?.nombre || 'invitado').trim().toLowerCase();
  }

  private getSaldo(localId: string): number {
    const saldos = this.leerSaldos();
    return saldos[localId] ?? (this.locales.find((item) => item.id === localId)?.puntos ?? 0);
  }

  private leerSaldos(): Record<string, number> {
    try {
      const data = JSON.parse(localStorage.getItem(SALDOS_KEY) || '{}') as Record<string, Record<string, number>>;
      return data[this.usuarioKey()] || {};
    } catch { return {}; }
  }

  private guardarSaldo(localId: string, saldo: number) {
    try {
      const data = JSON.parse(localStorage.getItem(SALDOS_KEY) || '{}') as Record<string, Record<string, number>>;
      data[this.usuarioKey()] = { ...(data[this.usuarioKey()] || {}), [localId]: saldo };
      localStorage.setItem(SALDOS_KEY, JSON.stringify(data));
    } catch { /* localStorage unavailable */ }
  }

  private leerMovimientos(): MovimientoPuntos[] {
    try {
      const data = JSON.parse(localStorage.getItem(MOVIMIENTOS_KEY) || '{}') as Record<string, MovimientoPuntos[]>;
      return data[this.usuarioKey()] || [];
    } catch { return []; }
  }

  private guardarMovimiento(movimiento: MovimientoPuntos) {
    try {
      const data = JSON.parse(localStorage.getItem(MOVIMIENTOS_KEY) || '{}') as Record<string, MovimientoPuntos[]>;
      data[this.usuarioKey()] = [...(data[this.usuarioKey()] || []), movimiento];
      localStorage.setItem(MOVIMIENTOS_KEY, JSON.stringify(data));
    } catch { /* localStorage unavailable */ }
  }

  private getProductos(local: Local): Producto[] {
    return [...local.productos, ...(this.leerOfertas()[local.id] || [])];
  }

  private leerOfertas(): Record<string, Producto[]> {
    try { return JSON.parse(localStorage.getItem(OFERTAS_KEY) || '{}') as Record<string, Producto[]>; }
    catch { return {}; }
  }

  private guardarOfertas(ofertas: Record<string, Producto[]>) {
    try { localStorage.setItem(OFERTAS_KEY, JSON.stringify(ofertas)); }
    catch { /* localStorage unavailable */ }
  }
}
