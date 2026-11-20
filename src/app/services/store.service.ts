import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { emptyRecord, readJson, writeJson } from './demo-storage';

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

interface DemoState {
  saldos: Record<string, Record<string, number>>;
  movimientos: Record<string, MovimientoPuntos[]>;
}

const STATE_KEY = 'snacki.demo-state';
const LEGACY_SALDOS_KEY = 'snacki.point-balances';
const LEGACY_MOVIMIENTOS_KEY = 'snacki.point-movements';
const OFERTAS_KEY = 'snacki.store-offers';

/** Estado local para la demo; en producción los saldos deben venir del backend. */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private auth = inject(AuthService);
  private readonly locales: Local[] = [
    {
      id: 'burger-house',
      nombre: 'Burger House',
      logo: 'assets/img/logo-burger-house.png',
      puntos: 1250,
      vencimiento: '2027-01-01',
      productos: [
        { nombre: 'Combo Bacon Burger', puntos: 600, imagen: 'assets/img/prod-combo-bacon.jpg' },
        { nombre: 'Helado de Vainilla', puntos: 100, imagen: 'assets/img/prod-helado.jpg' },
        { nombre: 'Nuggets de Pollo', puntos: 300, imagen: 'assets/img/prod-nuggets.jpg' },
        { nombre: 'Ensalada Cesar', puntos: 400, imagen: 'assets/img/prod-ensalada.jpg' },
      ],
    },
    { id: 'pizza-hut', nombre: 'Pizza Hut', logo: 'assets/img/logo-pizza-hut.png', puntos: 6250, vencimiento: '2027-01-03', productos: [] },
    { id: 'quattro-d', nombre: 'Quattro d', logo: 'assets/img/logo-quattro-d.png', puntos: 3000, vencimiento: '2027-01-02', productos: [] },
    { id: 'spaghettoteca', nombre: 'Spaghettoteca', logo: 'assets/img/logo-spaghettoteca.png', puntos: 2000, vencimiento: '2027-01-05', productos: [] },
  ];

  getAll(): Local[] {
    const saldos = this.leerSaldosUsuario();
    return this.locales.map((local) => ({
      ...local,
      puntos: this.getSaldoDesde(local, saldos),
      productos: this.getProductos(local),
    }));
  }

  getById(id: string | null | undefined): Local | undefined {
    const local = this.locales.find((item) => item.id === id);
    if (!local) return undefined;
    const saldos = this.leerSaldosUsuario();
    return { ...local, puntos: this.getSaldoDesde(local, saldos), productos: this.getProductos(local) };
  }

  buscar(texto: string): Local[] {
    const q = texto.trim().toLowerCase();
    return this.getAll().filter((local) => !q || local.nombre.toLowerCase().includes(q));
  }

  get totalPuntos(): number {
    const saldos = this.leerSaldosUsuario();
    return this.locales.reduce((sum, local) => sum + this.getSaldoDesde(local, saldos), 0);
  }

  get movimientos(): MovimientoPuntos[] {
    return this.leerMovimientosUsuario().sort((a, b) => b.fecha.localeCompare(a.fecha));
  }

  /** Acredita un QR de demostración una sola vez por identificador de compra. */
  acreditarCompra(localId: string, purchaseId: string, puntos: number): 'ok' | 'duplicado' | 'invalido' {
    const local = this.locales.find((item) => item.id === localId);
    if (!local || !purchaseId || !Number.isSafeInteger(puntos) || puntos <= 0 || puntos > 100000) return 'invalido';

    const movimientoId = `purchase:${localId}:${purchaseId}`;
    const state = this.leerEstado();
    const userKey = this.usuarioKey();
    const movimientosUsuario = this.leerMovimientosDeEstado(state, userKey);
    if (movimientosUsuario.some((item) => item.id === movimientoId)) return 'duplicado';

    const saldosUsuario = this.leerSaldosDeEstado(state, userKey);
    const saldoActual = this.getSaldoDesde(local, saldosUsuario);
    const nuevoMovimiento: MovimientoPuntos = {
      id: movimientoId,
      localId,
      local: local.nombre,
      tipo: 'acumulacion',
      descripcion: 'Puntos por compra',
      puntos,
      fecha: new Date().toISOString(),
    };

    const nuevosMovimientosUsuario = [...movimientosUsuario, nuevoMovimiento];
    const nuevosSaldosUsuario = this.clonarMapaNumerico(saldosUsuario);
    nuevosSaldosUsuario[localId] = saldoActual + puntos;

    const nuevoEstado = this.clonarEstado(state);
    nuevoEstado.movimientos[userKey] = nuevosMovimientosUsuario;
    nuevoEstado.saldos[userKey] = nuevosSaldosUsuario;

    if (!writeJson(STATE_KEY, nuevoEstado)) return 'invalido';
    return 'ok';
  }

  canjear(localId: string, producto: Producto): 'ok' | 'saldo-insuficiente' | 'invalido' {
    const local = this.locales.find((item) => item.id === localId);
    if (!local || !this.esProductoValido(producto)) return 'invalido';
    if (!this.getProductos(local).some((item) => this.mismoProducto(item, producto))) return 'invalido';

    const state = this.leerEstado();
    const userKey = this.usuarioKey();
    const saldosUsuario = this.leerSaldosDeEstado(state, userKey);
    const saldo = this.getSaldoDesde(local, saldosUsuario);
    if (saldo < producto.puntos) return 'saldo-insuficiente';

    const movimientosUsuario = this.leerMovimientosDeEstado(state, userKey);
    const nuevoMovimiento: MovimientoPuntos = {
      id: `redeem:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      localId,
      local: local.nombre,
      tipo: 'canje',
      descripcion: producto.nombre,
      puntos: producto.puntos,
      fecha: new Date().toISOString(),
    };

    const nuevosSaldosUsuario = this.clonarMapaNumerico(saldosUsuario);
    nuevosSaldosUsuario[localId] = saldo - producto.puntos;
    const nuevoEstado = this.clonarEstado(state);
    nuevoEstado.saldos[userKey] = nuevosSaldosUsuario;
    nuevoEstado.movimientos[userKey] = [...movimientosUsuario, nuevoMovimiento];

    if (!writeJson(STATE_KEY, nuevoEstado)) return 'invalido';
    return 'ok';
  }

  agregarRecompensa(localId: string, nombre: string, puntos: number): boolean {
    const local = this.locales.find((item) => item.id === localId);
    const cleanName = nombre.trim();
    if (!this.esComercioAutorizado(localId)) return false;
    if (!local || !cleanName || cleanName.length > 60 || !Number.isSafeInteger(puntos) || puntos < 1 || puntos > 100000) return false;

    const ofertas = this.leerOfertas();
    const actuales = this.leerOfertasDeLocal(ofertas, localId);
    if (this.getProductos(local).some((item) => item.nombre.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return false;

    const nuevasOfertas = this.clonarOfertas(ofertas);
    nuevasOfertas[localId] = [...actuales, { nombre: cleanName, puntos, imagen: 'assets/img/prod-combo-bacon.jpg' }];
    return writeJson(OFERTAS_KEY, nuevasOfertas);
  }

  eliminarRecompensa(localId: string, nombre: string): boolean {
    const local = this.locales.find((item) => item.id === localId);
    if (!this.esComercioAutorizado(localId)) return false;
    if (!local) return false;
    if (local.productos.some((item) => item.nombre.toLocaleLowerCase() === nombre.toLocaleLowerCase())) return false;

    const ofertas = this.leerOfertas();
    const actuales = this.leerOfertasDeLocal(ofertas, localId);
    const actualizadas = actuales.filter((item) => item.nombre.toLocaleLowerCase() !== nombre.toLocaleLowerCase());
    if (actualizadas.length === actuales.length) return false;

    const nuevasOfertas = this.clonarOfertas(ofertas);
    nuevasOfertas[localId] = actualizadas;
    return writeJson(OFERTAS_KEY, nuevasOfertas);
  }

  private usuarioKey(): string {
    const user = this.auth.currentUser as ({ id?: string; correo?: string; nombre?: string } | null);
    const raw = user?.id || user?.correo || user?.nombre || 'invitado';
    return String(raw).trim().toLowerCase();
  }

  private esComercioAutorizado(localId: string): boolean {
    const user = this.auth.currentUser as ({ tipo?: string; comercioId?: string } | null);
    return user?.tipo === 'comercio' && user.comercioId === localId;
  }

  private getSaldo(localId: string): number {
    const local = this.locales.find((item) => item.id === localId);
    if (!local) return 0;
    return this.getSaldoDesde(local, this.leerSaldosUsuario());
  }

  private getSaldoDesde(local: Local, saldos: Record<string, number>): number {
    const saldo = saldos[local.id];
    return typeof saldo === 'number' && Number.isFinite(saldo) ? saldo : local.puntos;
  }

  private leerSaldosUsuario(): Record<string, number> {
    const state = this.leerEstado();
    return this.leerSaldosDeEstado(state, this.usuarioKey());
  }

  private leerMovimientosUsuario(): MovimientoPuntos[] {
    const state = this.leerEstado();
    return this.leerMovimientosDeEstado(state, this.usuarioKey());
  }

  private leerEstado(): DemoState {
    const rawState = readJson<unknown>(STATE_KEY, null);
    if (rawState && typeof rawState === 'object') {
      return this.validarEstado(rawState as Record<string, unknown>);
    }
    return this.migrarEstadoLegacy();
  }

  private migrarEstadoLegacy(): DemoState {
    const legacySaldos = readJson<unknown>(LEGACY_SALDOS_KEY, null);
    const legacyMovimientos = readJson<unknown>(LEGACY_MOVIMIENTOS_KEY, null);
    const estado = this.estadoVacio();
    if (legacySaldos && typeof legacySaldos === 'object') {
      estado.saldos = this.validarMapaSaldos(legacySaldos as Record<string, unknown>);
    }
    if (legacyMovimientos && typeof legacyMovimientos === 'object') {
      estado.movimientos = this.validarMapaMovimientos(legacyMovimientos as Record<string, unknown>);
    }
    this.aliasIdentidadLegacy(estado);
    return estado;
  }

  /** Las claves legacy usaban correo/nombre; las sesiones actuales usan un id estable. */
  private aliasIdentidadLegacy(estado: DemoState): void {
    const user = this.auth.currentUser as ({ correo?: string; nombre?: string } | null);
    if (!user) return;
    const actual = this.usuarioKey();
    const clavesLegacy = [user.correo, user.nombre]
      .filter((valor): valor is string => typeof valor === 'string' && !!valor.trim())
      .map((valor) => valor.trim().toLowerCase());

    for (const clave of clavesLegacy) {
      if (clave === actual) continue;
      const saldos = estado.saldos[clave];
      if (saldos && !estado.saldos[actual]) estado.saldos[actual] = saldos;
      const movimientos = estado.movimientos[clave];
      if (movimientos && !estado.movimientos[actual]) estado.movimientos[actual] = movimientos;
    }
  }

  private estadoVacio(): DemoState {
    return { saldos: emptyRecord<Record<string, number>>(), movimientos: emptyRecord<MovimientoPuntos[]>() };
  }

  private validarEstado(raw: Record<string, unknown>): DemoState {
    const saldosRaw = raw['saldos'];
    const movimientosRaw = raw['movimientos'];
    return {
      saldos: saldosRaw && typeof saldosRaw === 'object' ? this.validarMapaSaldos(saldosRaw as Record<string, unknown>) : emptyRecord<Record<string, number>>(),
      movimientos: movimientosRaw && typeof movimientosRaw === 'object' ? this.validarMapaMovimientos(movimientosRaw as Record<string, unknown>) : emptyRecord<MovimientoPuntos[]>(),
    };
  }

  private validarMapaSaldos(raw: Record<string, unknown>): Record<string, Record<string, number>> {
    const resultado = emptyRecord<Record<string, number>>();
    for (const userKey of Object.keys(raw)) {
      const porUsuario = raw[userKey];
      if (!porUsuario || typeof porUsuario !== 'object' || Array.isArray(porUsuario)) continue;
      const mapaUsuario = emptyRecord<number>();
      const fuente = porUsuario as Record<string, unknown>;
      for (const localId of Object.keys(fuente)) {
        const valor = fuente[localId];
        if (typeof valor === 'number' && Number.isFinite(valor)) {
          mapaUsuario[localId] = valor;
        }
      }
      resultado[userKey] = mapaUsuario;
    }
    return resultado;
  }

  private validarMapaMovimientos(raw: Record<string, unknown>): Record<string, MovimientoPuntos[]> {
    const resultado = emptyRecord<MovimientoPuntos[]>();
    for (const userKey of Object.keys(raw)) {
      const valor = raw[userKey];
      if (!Array.isArray(valor)) continue;
      const movimientos: MovimientoPuntos[] = [];
      for (const item of valor) {
        const movimiento = this.validarMovimiento(item);
        if (movimiento) movimientos.push(movimiento);
      }
      resultado[userKey] = movimientos;
    }
    return resultado;
  }

  private validarMovimiento(item: unknown): MovimientoPuntos | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    const id = raw['id'];
    const localId = raw['localId'];
    const local = raw['local'];
    const tipo = raw['tipo'];
    const descripcion = raw['descripcion'];
    const puntos = raw['puntos'];
    const fecha = raw['fecha'];
    if (typeof id !== 'string' || !id) return null;
    if (typeof localId !== 'string' || !localId) return null;
    if (typeof local !== 'string' || !local) return null;
    if (tipo !== 'acumulacion' && tipo !== 'canje') return null;
    if (typeof descripcion !== 'string') return null;
    if (typeof puntos !== 'number' || !Number.isFinite(puntos) || !Number.isSafeInteger(puntos) || puntos <= 0) return null;
    if (typeof fecha !== 'string' || !fecha) return null;
    return { id, localId, local, tipo, descripcion, puntos, fecha };
  }

  private leerSaldosDeEstado(state: DemoState, userKey: string): Record<string, number> {
    const saldos = state.saldos[userKey];
    if (!saldos || typeof saldos !== 'object') return emptyRecord<number>();
    return this.clonarMapaNumerico(saldos);
  }

  private leerMovimientosDeEstado(state: DemoState, userKey: string): MovimientoPuntos[] {
    const movimientos = state.movimientos[userKey];
    return Array.isArray(movimientos) ? [...movimientos] : [];
  }

  private clonarEstado(state: DemoState): DemoState {
    const saldos = emptyRecord<Record<string, number>>();
    for (const userKey of Object.keys(state.saldos)) {
      saldos[userKey] = this.clonarMapaNumerico(state.saldos[userKey] || emptyRecord<number>());
    }
    const movimientos = emptyRecord<MovimientoPuntos[]>();
    for (const userKey of Object.keys(state.movimientos)) {
      const lista = state.movimientos[userKey];
      movimientos[userKey] = Array.isArray(lista) ? [...lista] : [];
    }
    return { saldos, movimientos };
  }

  private clonarMapaNumerico(mapa: Record<string, number>): Record<string, number> {
    const copia = emptyRecord<number>();
    for (const key of Object.keys(mapa)) {
      const valor = mapa[key];
      if (typeof valor === 'number' && Number.isFinite(valor)) copia[key] = valor;
    }
    return copia;
  }

  private getProductos(local: Local): Producto[] {
    return [...local.productos, ...this.leerOfertasDeLocal(this.leerOfertas(), local.id)];
  }

  private leerOfertas(): Record<string, Producto[]> {
    const raw = readJson<unknown>(OFERTAS_KEY, null);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyRecord<Producto[]>();
    const fuente = raw as Record<string, unknown>;
    const resultado = emptyRecord<Producto[]>();
    for (const localId of Object.keys(fuente)) {
      const valor = fuente[localId];
      if (!Array.isArray(valor)) continue;
      const productos: Producto[] = [];
      for (const item of valor) {
        const producto = this.validarProducto(item);
        if (producto) productos.push(producto);
      }
      resultado[localId] = productos;
    }
    return resultado;
  }

  private leerOfertasDeLocal(ofertas: Record<string, Producto[]>, localId: string): Producto[] {
    const lista = ofertas[localId];
    return Array.isArray(lista) ? [...lista] : [];
  }

  private clonarOfertas(ofertas: Record<string, Producto[]>): Record<string, Producto[]> {
    const copia = emptyRecord<Producto[]>();
    for (const localId of Object.keys(ofertas)) {
      copia[localId] = this.leerOfertasDeLocal(ofertas, localId);
    }
    return copia;
  }

  private validarProducto(item: unknown): Producto | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    const nombre = raw['nombre'];
    const puntos = raw['puntos'];
    const imagen = raw['imagen'];
    if (typeof nombre !== 'string') return null;
    const cleanName = nombre.trim();
    if (!cleanName || cleanName.length > 60) return null;
    if (typeof puntos !== 'number' || !Number.isSafeInteger(puntos) || puntos < 1 || puntos > 100000) return null;
    if (typeof imagen !== 'string') return null;
    return { nombre: cleanName, puntos, imagen };
  }

  private esProductoValido(producto: Producto): boolean {
    return this.validarProducto(producto) !== null;
  }

  private mismoProducto(a: Producto, b: Producto): boolean {
    return a.nombre === b.nombre && a.puntos === b.puntos && a.imagen === b.imagen;
  }
}
