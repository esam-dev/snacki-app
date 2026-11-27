import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';
import { readJson, writeJson } from './demo-storage';

/** Mi programa de invitación en un comercio (los puntos y los códigos son por comercio). */
export interface ReferidoComercio {
  tenantId: string;
  slug: string;
  nombre: string;
  logo: string | null;
  codigo: string;
  bonoInvita: number;
  bonoInvitado: number;
  maximo: number;
  restantes: number;
  pendientes: number;
  completados: number;
  bonoGanado: number;
  /** Si yo llegué invitado a este comercio: quién me invitó y si ya hice la primera compra. */
  invitadoPor: { nombre: string; estado: 'PENDING' | 'COMPLETED' } | null;
}

export interface ReferidosDatos {
  comercios: ReferidoComercio[];
  actualizado: string;
}

export type ResultadoAplicar =
  | { ok: true; comercio: string; comercioId: string; invita: string; bonoInvitado: number }
  | { ok: false; codigo: string; mensaje: string };

interface ApiReferralTenant {
  tenantId: string; slug: string; name: string; logoUrl: string | null; code: string;
  referrerBonusPoints: number; refereeBonusPoints: number; maxReferrals: number; remainingInvites: number;
  pending: number; completed: number; bonusEarned: number;
  referredBy: { name: string; status: 'PENDING' | 'COMPLETED' } | null;
}

const CACHE_PREFIX = 'snacki.referrals.';
const TIMEOUT_MS = 10_000;
const SIN_CONEXION = 'Necesitas conexión para usar un código de invitación.';

/**
 * "Invita y gana" contra el backend (`/api/referrals/*`). Guarda la última respuesta por usuario para
 * mostrar el código sin conexión; aplicar un código siempre requiere conexión.
 */
@Injectable({ providedIn: 'root' })
export class ReferralsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private config = inject(AppConfigService);

  /** Sube cada vez que llegan datos nuevos del servidor. */
  readonly version = signal(0);

  private cacheUsuario: string | null = null;
  private cache: ReferidosDatos | null = null;

  get disponible(): boolean {
    const user = this.auth.currentUser;
    return !!user?.id && user.role === 'cliente';
  }

  /** Últimos datos conocidos del usuario actual (del servidor o de la caché local), o null. */
  get datos(): ReferidosDatos | null {
    const userId = this.disponible ? this.auth.currentUser!.id : null;
    if (userId !== this.cacheUsuario) {
      this.cacheUsuario = userId;
      this.cache = userId ? this.leerCache(userId) : null;
    }
    return this.cache;
  }

  async refrescar(): Promise<boolean> {
    if (!this.disponible) return false;
    const userId = this.auth.currentUser!.id;
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: { tenants: ApiReferralTenant[] } }>(`${this.config.apiBaseUrl}/api/referrals/me`).pipe(timeout(TIMEOUT_MS)),
      );
      if (this.auth.currentUser?.id !== userId) return false;
      const datos: ReferidosDatos = { comercios: res.data.tenants.map((t) => this.mapear(t)), actualizado: new Date().toISOString() };
      this.cacheUsuario = userId;
      this.cache = datos;
      writeJson(CACHE_PREFIX + userId, datos);
      this.version.update((v) => v + 1);
      return true;
    } catch {
      return false; // sin conexión: se sigue mostrando lo último conocido
    }
  }

  /** Aplica el código de un amigo. El bono llega cuando haga su primera compra con promo en ese comercio. */
  async aplicar(codigo: string): Promise<ResultadoAplicar> {
    if (!this.disponible) return { ok: false, codigo: 'NO_CLIENTE', mensaje: 'Inicia sesión con una cuenta de cliente para usar un código.' };
    const limpio = codigo.trim();
    if (limpio.length < 4) return { ok: false, codigo: 'VALIDATION_ERROR', mensaje: 'Escribe el código completo.' };
    try {
      const res = await firstValueFrom(
        this.http
          .post<{ data: { tenant: { id: string; name: string }; referrerName: string; refereeBonusPoints: number } }>(
            `${this.config.apiBaseUrl}/api/referrals/apply`, { code: limpio },
          )
          .pipe(timeout(TIMEOUT_MS)),
      );
      await this.refrescar();
      const d = res.data;
      const slug = this.datos?.comercios.find((c) => c.tenantId === d.tenant.id)?.slug ?? '';
      return { ok: true, comercio: d.tenant.name, comercioId: slug, invita: d.referrerName, bonoInvitado: d.refereeBonusPoints };
    } catch (err) {
      return this.mapearError(err);
    }
  }

  private mapearError(err: unknown): { ok: false; codigo: string; mensaje: string } {
    if (err instanceof TimeoutError) return { ok: false, codigo: 'TIMEOUT', mensaje: SIN_CONEXION };
    if (!(err instanceof HttpErrorResponse)) return { ok: false, codigo: 'UNKNOWN', mensaje: 'No se pudo aplicar el código.' };
    if (err.status === 0) return { ok: false, codigo: 'NETWORK_ERROR', mensaje: SIN_CONEXION };
    if (err.status === 401) return { ok: false, codigo: 'UNAUTHORIZED', mensaje: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
    if (err.status >= 500) return { ok: false, codigo: 'SERVER_ERROR', mensaje: 'El servidor no pudo aplicar el código. Inténtalo más tarde.' };
    const api = err.error?.error as { code?: string; message?: string } | undefined;
    if (api?.code === 'VALIDATION_ERROR') return { ok: false, codigo: api.code, mensaje: 'Escribe el código completo.' };
    // El servidor ya explica el motivo en español (propio, ya cliente, ya usado, tope, etc.).
    return { ok: false, codigo: api?.code ?? 'ERROR', mensaje: api?.message ?? 'No se pudo aplicar el código.' };
  }

  private mapear(t: ApiReferralTenant): ReferidoComercio {
    const logo = t.logoUrl ? (t.logoUrl.startsWith('/api/') ? `${this.config.apiBaseUrl}${t.logoUrl}` : t.logoUrl) : null;
    return {
      tenantId: t.tenantId,
      slug: t.slug,
      nombre: t.name,
      logo,
      codigo: t.code,
      bonoInvita: t.referrerBonusPoints,
      bonoInvitado: t.refereeBonusPoints,
      maximo: t.maxReferrals,
      restantes: t.remainingInvites,
      pendientes: t.pending,
      completados: t.completed,
      bonoGanado: t.bonusEarned,
      invitadoPor: t.referredBy ? { nombre: t.referredBy.name, estado: t.referredBy.status } : null,
    };
  }

  private leerCache(userId: string): ReferidosDatos | null {
    const raw = readJson<unknown>(CACHE_PREFIX + userId, null);
    if (!raw || typeof raw !== 'object' || !Array.isArray((raw as ReferidosDatos).comercios)) return null;
    return raw as ReferidosDatos;
  }
}
