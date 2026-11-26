import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { emptyRecord, readJson, writeJson } from './demo-storage';
import { WalletComercio, WalletService } from './wallet.service';

/** Recompensa canjeable por puntos. */
export interface Producto {
  nombre: string;
  puntos: number;
  imagen: string;
  id?: string;
  descripcion?: string;
}

/** Promo vigente del comercio: al comprarla en el local se acumulan `puntos`. */
export interface Promo {
  id: string;
  nombre: string;
  descripcion: string;
  puntos: number;
  imagen: string;
  inicio: string;
  fin: string;
}

export interface Local {
  id: string;
  nombre: string;
  logo: string;
  puntos: number;
  vencimiento: string;
  productos: Producto[];
  promos: Promo[];
  categoria?: string;
  direccion?: string;
  /** Datos de la wallet del servidor (solo con sesión de cliente y catálogo del servidor). */
  siguienteRecompensa?: WalletComercio['siguiente'];
  puntosPorVencer?: number;
  canjeables?: number;
}

interface ApiPromo {
  id: string; name: string; description: string | null; points: number;
  imageUrl: string | null; promoStartsAt: string; promoEndsAt: string;
}
interface ApiReward { id: string; name: string; description: string | null; cost: number; imageUrl: string | null; }
interface ApiTenant {
  id: string; slug: string; name: string; category: string; address: string | null;
  logoUrl: string | null; pointsExpireAt: string | null; products: ApiPromo[]; rewards: ApiReward[];
}

export interface MovimientoPuntos {
  id: string;
  localId: string;
  local: string;
  tipo: 'acumulacion' | 'canje';
  descripcion: string;
  puntos: number;
  fecha: string;
  /** Puntos acumulados que vencieron sin usarse (ya no cuentan en el saldo). */
  vencido?: boolean;
}

interface DemoState {
  saldos: Record<string, Record<string, number>>;
  movimientos: Record<string, MovimientoPuntos[]>;
}

const STATE_KEY = 'snacki.demo-state';
const LEGACY_SALDOS_KEY = 'snacki.point-balances';
const LEGACY_MOVIMIENTOS_KEY = 'snacki.point-movements';
const OFERTAS_KEY = 'snacki.store-offers';
const CATALOGO_KEY = 'snacki.catalog-cache';
const IMAGEN_POR_DEFECTO = 'assets/icon/icon-snacki.png';
const CATALOGO_TIMEOUT_MS = 10_000;

/**
 * Catálogo y saldos que ve el cliente. Con catálogo del servidor y sesión de cliente, los saldos y
 * movimientos vienen de la wallet del backend; el estado local solo se usa en modo demostración.
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private auth = inject(AuthService);
  private http = inject(HttpClient);
  private wallet = inject(WalletService);

  private readonly versionCatalogo = signal(0);
  /** Sube cada vez que cambia el catálogo o la wallet del servidor; las pantallas lo observan para repintarse. */
  readonly catalogoVersion = computed(() => this.versionCatalogo() + this.wallet.version());
  private catalogoRemoto: Local[] | null = this.leerCatalogoCache();
  private ultimaActualizacion = 0;
  private refrescando: Promise<boolean> | null = null;

  /** Catálogo de demostración: se usa mientras no haya datos del servidor (primer arranque sin conexión). */
  private readonly localesBase: Local[] = [
    {
      id: 'burger-house',
      nombre: 'Burger House',
      logo: 'assets/img/logo-burger-house.png',
      puntos: 1250,
      vencimiento: '2027-01-01',
      promos: [],
      productos: [
        { nombre: 'Combo Bacon Burger', puntos: 600, imagen: 'assets/img/prod-combo-bacon.jpg' },
        { nombre: 'Helado de Vainilla', puntos: 100, imagen: 'assets/img/prod-helado.jpg' },
        { nombre: 'Nuggets de Pollo', puntos: 300, imagen: 'assets/img/prod-nuggets.jpg' },
        { nombre: 'Ensalada Cesar', puntos: 400, imagen: 'assets/img/prod-ensalada.jpg' },
      ],
    },
    { id: 'pizza-hut', nombre: 'Pizza Hut', logo: 'assets/img/logo-pizza-hut.png', puntos: 6250, vencimiento: '2027-01-03', promos: [], productos: [] },
    { id: 'quattro-d', nombre: 'Quattro d', logo: 'assets/img/logo-quattro-d.png', puntos: 3000, vencimiento: '2027-01-02', promos: [], productos: [] },
    { id: 'spaghettoteca', nombre: 'Spaghettoteca', logo: 'assets/img/logo-spaghettoteca.png', puntos: 2000, vencimiento: '2027-01-05', promos: [], productos: [] },
  ];

  /** Comercios visibles: los del servidor cuando ya se descargaron; si no, el catálogo de demostración. */
  private get locales(): Local[] {
    return this.catalogoRemoto ?? this.localesBase;
  }

  /**
   * Descarga lo que publican los comercios (datos, logo, promos vigentes y recompensas activas).
   * Devuelve true si el catálogo se actualizó. `maxEdadMs` evita repetir la descarga si es reciente.
   */
  refrescarCatalogo(maxEdadMs = 0): Promise<boolean> {
    if (this.refrescando) return this.refrescando;
    if (maxEdadMs > 0 && Date.now() - this.ultimaActualizacion < maxEdadMs) return Promise.resolve(false);

    this.refrescando = (async () => {
      try {
        const res = await firstValueFrom(
          this.http
            .get<{ data: { tenants: ApiTenant[] } }>(`${environment.apiBaseUrl}/api/catalog/tenants`)
            .pipe(timeout(CATALOGO_TIMEOUT_MS)),
        );
        this.catalogoRemoto = (res.data?.tenants ?? []).map((tenant) => this.mapearTenant(tenant));
        this.ultimaActualizacion = Date.now();
        writeJson(CATALOGO_KEY, this.catalogoRemoto);
        this.versionCatalogo.update((v) => v + 1);
        return true;
      } catch {
        // Sin conexión o servidor caído: se sigue con el último catálogo conocido.
        return false;
      } finally {
        this.refrescando = null;
      }
    })();
    return this.refrescando;
  }

  /** Catálogo y wallet a la vez (lo que usan las pantallas del cliente). */
  async refrescar(maxEdadMs = 0): Promise<void> {
    await Promise.all([this.refrescarCatalogo(maxEdadMs), this.wallet.refrescar(maxEdadMs)]);
  }

  /** true cuando los saldos salen del servidor y no del estado de demostración. */
  get usaWallet(): boolean {
    return this.catalogoRemoto !== null && this.wallet.disponible;
  }

  /** Última vez que la wallet se sincronizó con el servidor (ISO), si aplica. */
  get walletActualizada(): string | null {
    return this.usaWallet ? this.wallet.datos?.actualizado ?? null : null;
  }

  getAll(): Local[] {
    const saldos = this.leerSaldosUsuario();
    return this.locales.map((local) => this.conSaldo(local, saldos));
  }

  getById(id: string | null | undefined): Local | undefined {
    const local = this.locales.find((item) => item.id === id);
    if (!local) return undefined;
    return this.conSaldo(local, this.leerSaldosUsuario());
  }

  private conSaldo(local: Local, saldos: Record<string, number>): Local {
    const base = { ...local, productos: this.getProductos(local) };
    if (!this.usaWallet) return { ...base, puntos: this.getSaldoDesde(local, saldos) };
    // Comercio sin movimientos (o wallet aún sin descargar): saldo 0, nunca el de demostración.
    const w = this.wallet.comercio(local.id);
    return {
      ...base,
      puntos: w?.saldo ?? 0,
      vencimiento: w?.vence ? w.vence.slice(0, 10) : '',
      puntosPorVencer: w?.puntosPorVencer ?? 0,
      siguienteRecompensa: w ? w.siguiente : this.primeraRecompensa(base.productos),
      canjeables: w?.canjeables ?? 0,
    };
  }

  private primeraRecompensa(productos: Producto[]): WalletComercio['siguiente'] {
    const masBarata = [...productos].sort((a, b) => a.puntos - b.puntos)[0];
    return masBarata ? { id: masBarata.id ?? masBarata.nombre, nombre: masBarata.nombre, costo: masBarata.puntos, faltan: masBarata.puntos, progreso: 0 } : null;
  }

  buscar(texto: string): Local[] {
    const q = texto.trim().toLowerCase();
    return this.getAll().filter((local) => !q || local.nombre.toLowerCase().includes(q));
  }

  get totalPuntos(): number {
    return this.getAll().reduce((sum, local) => sum + local.puntos, 0);
  }

  get movimientos(): MovimientoPuntos[] {
    const lista = this.usaWallet ? [...(this.wallet.datos?.movimientos ?? [])] : this.leerMovimientosUsuario();
    return lista.sort((a, b) => b.fecha.localeCompare(a.fecha));
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
    // Con catálogo del servidor las recompensas vienen de ahí; las ofertas guardadas en el dispositivo son de la demo.
    const extras = this.catalogoRemoto ? [] : this.leerOfertasDeLocal(this.leerOfertas(), local.id);
    return [...local.productos, ...extras];
  }

  private mapearTenant(tenant: ApiTenant): Local {
    // El saldo real lo pone la wallet del servidor (ver conSaldo).
    return {
      id: tenant.slug,
      nombre: tenant.name,
      logo: this.resolverImagen(tenant.logoUrl) || IMAGEN_POR_DEFECTO,
      puntos: 0,
      vencimiento: tenant.pointsExpireAt ? tenant.pointsExpireAt.slice(0, 10) : '',
      categoria: tenant.category,
      direccion: tenant.address ?? undefined,
      productos: (tenant.rewards ?? []).map((reward) => ({
        id: reward.id,
        nombre: reward.name,
        puntos: reward.cost,
        imagen: this.resolverImagen(reward.imageUrl) || IMAGEN_POR_DEFECTO,
        descripcion: reward.description ?? '',
      })),
      promos: (tenant.products ?? []).map((promo) => ({
        id: promo.id,
        nombre: promo.name,
        descripcion: promo.description ?? '',
        puntos: promo.points,
        imagen: this.resolverImagen(promo.imageUrl) || IMAGEN_POR_DEFECTO,
        inicio: promo.promoStartsAt,
        fin: promo.promoEndsAt,
      })),
    };
  }

  /** Las fotos subidas por el comercio se sirven desde el backend (`/api/...`); las demás se usan tal cual. */
  private resolverImagen(url: string | null | undefined): string {
    if (!url) return '';
    return url.startsWith('/api/') ? `${environment.apiBaseUrl}${url}` : url;
  }

  private leerCatalogoCache(): Local[] | null {
    const raw = readJson<unknown>(CATALOGO_KEY, null);
    if (!Array.isArray(raw)) return null;
    const locales = raw.filter((item): item is Local => this.esLocalCacheado(item));
    return locales.length === raw.length ? locales : null;
  }

  private esLocalCacheado(item: unknown): boolean {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const raw = item as Record<string, unknown>;
    return typeof raw['id'] === 'string' && typeof raw['nombre'] === 'string' && typeof raw['logo'] === 'string'
      && typeof raw['puntos'] === 'number' && typeof raw['vencimiento'] === 'string'
      && Array.isArray(raw['productos']) && Array.isArray(raw['promos']);
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
    if (!cleanName || cleanName.length > 120) return null;
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
