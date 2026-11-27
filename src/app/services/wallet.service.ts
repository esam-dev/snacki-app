import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';
import { readJson, writeJson } from './demo-storage';

/** Saldo del cliente en un comercio, tal como lo calcula el servidor. */
export interface WalletComercio {
  tenantId: string;
  slug: string;
  nombre: string;
  saldo: number;
  /** Fecha ISO del próximo vencimiento de puntos (null si no vencen o no hay saldo). */
  vence: string | null;
  puntosPorVencer: number;
  /** Recompensa más barata que aún no alcanza. */
  siguiente: { id: string; nombre: string; costo: number; faltan: number; progreso: number } | null;
  canjeables: number;
}

export interface MovimientoWallet {
  id: string;
  localId: string;
  local: string;
  tipo: 'acumulacion' | 'canje';
  descripcion: string;
  puntos: number;
  fecha: string;
  vencido?: boolean;
}

export interface WalletDatos {
  total: number;
  comercios: WalletComercio[];
  movimientos: MovimientoWallet[];
  actualizado: string;
}

export interface VistaCanje {
  recompensa: string;
  comercio: string;
  comercioId: string;
  costo: number;
  saldo: number;
  alcanza: boolean;
}

export type ResultadoCanje =
  | { ok: true; recompensa: string; comercio: string; costo: number; saldo: number; codigo: string }
  | { ok: false; codigo: string; mensaje: string };

export type ResultadoEscaneo =
  | { ok: true; puntos: number; comercio: string; comercioId: string; saldo: number | null }
  | { ok: false; codigo: string; mensaje: string };

interface ApiWalletTenant {
  tenantId: string; slug: string; name: string; balance: number;
  nextExpiresAt: string | null; nextExpiringPoints: number; redeemableRewards: number;
  nextReward: { id: string; name: string; cost: number; missing: number; progress: number } | null;
}
interface ApiMovement {
  id: string; tenantSlug: string; tenantName: string; type: 'EARN' | 'REDEEM';
  points: number; description: string; createdAt: string; expired: boolean;
}
interface ApiClaim { points: number; tenant: { id: string; name: string } }

const CACHE_PREFIX = 'snacki.wallet.';
const TIMEOUT_MS = 10_000;
const SIN_CONEXION = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';

/** QR de compra firmado por el comercio: `snacki://claim/<token>` o el token `S1.…` directo. */
export function esQrDeCompra(valor: string): boolean {
  const v = valor.trim();
  return /^snacki:\/\/claim\/\S+$/i.test(v) || /^S1\.\S+$/.test(v);
}

/** QR de canje que genera el comercio para una recompensa: `snacki://redeem/<token>` o `R1.…`. */
export function esQrDeCanje(valor: string): boolean {
  const v = valor.trim();
  return /^snacki:\/\/redeem\/\S+$/i.test(v) || /^R1\.\S+$/.test(v);
}

/**
 * Wallet del cliente contra el backend (`/api/wallet`, `/api/claims`). Guarda la última respuesta
 * por usuario para mostrar el saldo sin conexión; el servidor siempre es la fuente de verdad.
 */
@Injectable({ providedIn: 'root' })
export class WalletService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private config = inject(AppConfigService);

  /** Sube cada vez que llegan datos nuevos del servidor. */
  readonly version = signal(0);

  private cacheUsuario: string | null = null;
  private cache: WalletDatos | null = null;
  private ultimaActualizacion = 0;
  private refrescando: Promise<boolean> | null = null;

  /** La wallet solo existe para cuentas de cliente con sesión iniciada. */
  get disponible(): boolean {
    const user = this.auth.currentUser;
    return !!user?.id && user.role === 'cliente';
  }

  /** Últimos datos conocidos del usuario actual (del servidor o de la caché local), o null. */
  get datos(): WalletDatos | null {
    const userId = this.disponible ? this.auth.currentUser!.id : null;
    if (userId !== this.cacheUsuario) {
      this.cacheUsuario = userId;
      this.cache = userId ? this.leerCache(userId) : null;
      this.ultimaActualizacion = 0;
    }
    return this.cache;
  }

  comercio(slug: string): WalletComercio | undefined {
    return this.datos?.comercios.find((c) => c.slug === slug);
  }

  refrescar(maxEdadMs = 0): Promise<boolean> {
    if (!this.disponible) return Promise.resolve(false);
    void this.datos; // sincroniza la caché con el usuario actual
    if (this.refrescando) return this.refrescando;
    if (maxEdadMs > 0 && Date.now() - this.ultimaActualizacion < maxEdadMs) return Promise.resolve(false);

    const userId = this.auth.currentUser!.id;
    this.refrescando = (async () => {
      try {
        const [wallet, movs] = await Promise.all([
          firstValueFrom(this.http.get<{ data: { totalPoints: number; tenants: ApiWalletTenant[]; updatedAt: string } }>(`${this.config.apiBaseUrl}/api/wallet`).pipe(timeout(TIMEOUT_MS))),
          firstValueFrom(this.http.get<{ data: { movements: ApiMovement[] } }>(`${this.config.apiBaseUrl}/api/wallet/movements`).pipe(timeout(TIMEOUT_MS))),
        ]);
        // Si cambió la sesión mientras se descargaba, se descarta la respuesta.
        if (this.auth.currentUser?.id !== userId) return false;
        const datos: WalletDatos = {
          total: wallet.data.totalPoints,
          comercios: wallet.data.tenants.map((t) => this.mapearComercio(t)),
          movimientos: movs.data.movements.map((m) => this.mapearMovimiento(m)),
          actualizado: wallet.data.updatedAt,
        };
        this.cacheUsuario = userId;
        this.cache = datos;
        this.ultimaActualizacion = Date.now();
        writeJson(CACHE_PREFIX + userId, datos);
        this.version.update((v) => v + 1);
        return true;
      } catch {
        return false; // sin conexión: se sigue mostrando la última wallet conocida
      } finally {
        this.refrescando = null;
      }
    })();
    return this.refrescando;
  }

  /** Envía el QR al servidor; los puntos los decide el servidor, no el contenido del QR. */
  async escanear(valor: string): Promise<ResultadoEscaneo> {
    if (!this.disponible) return { ok: false, codigo: 'NO_CLIENTE', mensaje: 'Inicia sesión con una cuenta de cliente para sumar puntos.' };
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: ApiClaim }>(`${this.config.apiBaseUrl}/api/claims`, { token: valor.trim() }).pipe(timeout(TIMEOUT_MS)),
      );
      await this.refrescar();
      const tenantId = res.data.tenant.id;
      const comercio = this.datos?.comercios.find((c) => c.tenantId === tenantId);
      return {
        ok: true,
        puntos: res.data.points,
        comercio: res.data.tenant.name,
        comercioId: comercio?.slug ?? '',
        saldo: comercio?.saldo ?? null,
      };
    } catch (err) {
      return this.mapearError(err);
    }
  }

  /** Muestra qué se va a canjear y si alcanza el saldo, sin descontar nada. */
  async previsualizarCanje(valor: string): Promise<{ ok: true; vista: VistaCanje } | { ok: false; codigo: string; mensaje: string }> {
    if (!this.disponible) return { ok: false, codigo: 'NO_CLIENTE', mensaje: 'Inicia sesión con una cuenta de cliente para canjear.' };
    try {
      const res = await firstValueFrom(
        this.http
          .post<{ data: { reward: { name: string }; tenant: { slug: string; name: string }; cost: number; balance: number; enough: boolean } }>(
            `${this.config.apiBaseUrl}/api/redemptions/preview`, { token: valor.trim() },
          )
          .pipe(timeout(TIMEOUT_MS)),
      );
      const d = res.data;
      return { ok: true, vista: { recompensa: d.reward.name, comercio: d.tenant.name, comercioId: d.tenant.slug, costo: d.cost, saldo: d.balance, alcanza: d.enough } };
    } catch (err) {
      return this.mapearError(err, 'No se pudo leer el QR de canje.');
    }
  }

  /** Canjea la recompensa del QR: el servidor descuenta los puntos una sola vez. */
  async canjear(valor: string): Promise<ResultadoCanje> {
    if (!this.disponible) return { ok: false, codigo: 'NO_CLIENTE', mensaje: 'Inicia sesión con una cuenta de cliente para canjear.' };
    try {
      const res = await firstValueFrom(
        this.http
          .post<{ data: { code: string; cost: number; balance: number; reward: { name: string }; tenant: { name: string } } }>(
            `${this.config.apiBaseUrl}/api/redemptions`, { token: valor.trim() },
          )
          .pipe(timeout(TIMEOUT_MS)),
      );
      await this.refrescar();
      const d = res.data;
      return { ok: true, recompensa: d.reward.name, comercio: d.tenant.name, costo: d.cost, saldo: d.balance, codigo: d.code };
    } catch (err) {
      return this.mapearError(err, 'No se pudo completar el canje.');
    }
  }

  private mapearError(err: unknown, fallback = 'No se pudo registrar la compra.'): { ok: false; codigo: string; mensaje: string } {
    if (err instanceof TimeoutError) return { ok: false, codigo: 'TIMEOUT', mensaje: SIN_CONEXION };
    if (!(err instanceof HttpErrorResponse)) return { ok: false, codigo: 'UNKNOWN', mensaje: fallback };
    if (err.status === 0) return { ok: false, codigo: 'NETWORK_ERROR', mensaje: SIN_CONEXION };
    const api = err.error?.error as { code?: string; message?: string } | undefined;
    if (err.status === 401) return { ok: false, codigo: 'UNAUTHORIZED', mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
    if (err.status === 403 && api?.code !== 'QR_OWN') return { ok: false, codigo: api?.code ?? 'FORBIDDEN', mensaje: 'Solo las cuentas de cliente pueden usar puntos.' };
    if (err.status >= 500) return { ok: false, codigo: 'SERVER_ERROR', mensaje: 'El servidor no pudo procesar el QR. Inténtalo más tarde.' };
    // 400 inválido, 403 QR propio, 409 ya usado, 410 vencido: el servidor ya manda el mensaje en español.
    return { ok: false, codigo: api?.code ?? 'ERROR', mensaje: api?.message ?? 'Este QR no es válido.' };
  }

  private mapearComercio(t: ApiWalletTenant): WalletComercio {
    return {
      tenantId: t.tenantId,
      slug: t.slug,
      nombre: t.name,
      saldo: t.balance,
      vence: t.nextExpiresAt,
      puntosPorVencer: t.nextExpiringPoints,
      canjeables: t.redeemableRewards,
      siguiente: t.nextReward
        ? { id: t.nextReward.id, nombre: t.nextReward.name, costo: t.nextReward.cost, faltan: t.nextReward.missing, progreso: t.nextReward.progress }
        : null,
    };
  }

  private mapearMovimiento(m: ApiMovement): MovimientoWallet {
    return {
      id: m.id,
      localId: m.tenantSlug,
      local: m.tenantName,
      tipo: m.type === 'REDEEM' ? 'canje' : 'acumulacion',
      descripcion: m.description,
      puntos: m.points,
      fecha: m.createdAt,
      ...(m.expired ? { vencido: true } : {}),
    };
  }

  private leerCache(userId: string): WalletDatos | null {
    const raw = readJson<unknown>(CACHE_PREFIX + userId, null);
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as Partial<WalletDatos>;
    if (typeof d.total !== 'number' || !Array.isArray(d.comercios) || !Array.isArray(d.movimientos)) return null;
    return d as WalletDatos;
  }
}
