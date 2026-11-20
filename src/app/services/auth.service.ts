import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ApiResponse,
  AuthSessionData,
  LoginPayload,
  MeSessionData,
  RegisterPayload,
  SessionUser,
  UserRole,
} from '../models/auth.models';
import { TokenStorageService } from './token-storage.service';

export type TipoCuenta = UserRole;
export type SnackiUser = SessionUser;

export interface AuthActionResult {
  success: boolean;
  message?: string;
  code?: string;
}

const LEGACY_SESSION_KEY = 'snacki.current-user';
const LEGACY_PROFILES_KEY = 'snacki.profiles';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);

  private readonly _currentUser = signal<SessionUser | null>(null);
  readonly authStatus = signal<'unknown' | 'authenticated' | 'anonymous'>('unknown');
  readonly currentUserSignal = this._currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.authStatus() === 'authenticated' && !!this._currentUser());
  readonly role = computed(() => this._currentUser()?.role ?? null);

  private restorePromise: Promise<void> | null = null;

  get currentUser(): SessionUser | null {
    return this._currentUser();
  }

  async restoreSession(): Promise<void> {
    if (this.authStatus() !== 'unknown') return;
    if (this.restorePromise) return this.restorePromise;

    this.restorePromise = (async () => {
      try {
        this.clearLegacyDemoAuthStorage();
        const token = await this.tokenStorage.getToken();
        if (!token) {
          this.clearSessionState();
          return;
        }
        const res = await firstValueFrom(
          this.http.get<ApiResponse<MeSessionData>>(`${environment.apiBaseUrl}/api/auth/me`),
        );
        this._currentUser.set(this.mapMeToSessionUser(res.data));
        this.authStatus.set('authenticated');
      } catch {
        await this.tokenStorage.clear();
        this.clearSessionState();
      } finally {
        this.restorePromise = null;
      }
    })();

    return this.restorePromise;
  }

  async ensureSessionResolved(): Promise<void> {
    if (this.authStatus() === 'unknown') {
      await this.restoreSession();
    }
  }

  async login(identifier: string, password: string, accountType: TipoCuenta = 'cliente'): Promise<AuthActionResult> {
    const payload: LoginPayload = {
      identifier: identifier.trim(),
      password,
      accountType,
    };
    if (!payload.identifier || !payload.password.trim()) {
      return { success: false, message: 'Completa tu usuario/correo y contraseña.' };
    }

    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<AuthSessionData>>(`${environment.apiBaseUrl}/api/auth/login`, payload),
      );
      await this.applyAuthSession(res.data);
      return { success: true };
    } catch (err) {
      return this.mapError(err, 'No se pudo iniciar sesión.');
    }
  }

  async register(
    nombre: string,
    correo: string,
    password: string,
    tipo: TipoCuenta = 'cliente',
    comercioId?: string,
  ): Promise<AuthActionResult> {
    const payload: RegisterPayload = {
      fullName: nombre.trim(),
      email: correo.trim().toLowerCase(),
      password,
      accountType: tipo,
      tenantId: tipo === 'comercio' ? (comercioId || null) : null,
    };

    if (!payload.fullName || !payload.email || !payload.password.trim()) {
      return { success: false, message: 'Completa todos los campos obligatorios.' };
    }
    if (tipo === 'comercio' && !payload.tenantId) {
      return { success: false, message: 'Selecciona el comercio asociado.' };
    }

    try {
      const res = await firstValueFrom(
        this.http.post<ApiResponse<AuthSessionData>>(`${environment.apiBaseUrl}/api/auth/register`, payload),
      );
      await this.applyAuthSession(res.data);
      return { success: true };
    } catch (err) {
      return this.mapError(err, 'No se pudo crear la cuenta.');
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.tokenStorage.clear();
    this.clearSessionState();
  }

  async logout(): Promise<void> {
    await this.cerrarSesion();
  }

  private async applyAuthSession(data: AuthSessionData): Promise<void> {
    await this.tokenStorage.setToken(data.auth.accessToken);
    this.clearLegacyDemoAuthStorage();
    this._currentUser.set(this.mapAuthToSessionUser(data));
    this.authStatus.set('authenticated');
  }

  private clearSessionState(): void {
    this._currentUser.set(null);
    this.authStatus.set('anonymous');
  }

  private clearLegacyDemoAuthStorage(): void {
    try {
      localStorage.removeItem(LEGACY_SESSION_KEY);
      localStorage.removeItem(LEGACY_PROFILES_KEY);
    } catch {
      // ignore storage access issues
    }
  }

  private mapAuthToSessionUser(data: AuthSessionData): SessionUser {
    return this.toSessionUser(data.user, data.membership);
  }

  private mapMeToSessionUser(data: MeSessionData): SessionUser {
    return this.toSessionUser(data.user, data.membership);
  }

  private toSessionUser(
    user: { id: string; fullName: string; email: string },
    membership: { role: UserRole; tenantId: string; tenantSlug?: string; tenantName?: string },
  ): SessionUser {
    const comercioId = membership.role === 'comercio' ? (membership.tenantSlug || membership.tenantId) : undefined;
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: membership.role,
      tenantId: membership.tenantId,
      tenantSlug: membership.tenantSlug,
      tenantName: membership.tenantName,
      // compatibility
      nombre: user.fullName,
      correo: user.email,
      tipo: membership.role,
      ...(comercioId ? { comercioId } : {}),
    };
  }

  private mapError(err: unknown, fallback: string): AuthActionResult {
    if (err instanceof HttpErrorResponse) {
      const api = err.error?.error;
      const code = api?.code as string | undefined;
      const message = (api?.message as string | undefined) || fallback;
      if (err.status === 401) return { success: false, code: code || 'UNAUTHORIZED', message: 'Credenciales inválidas o sesión expirada.' };
      if (err.status === 403) return { success: false, code: code || 'FORBIDDEN', message: message || 'No tienes acceso con el tipo de cuenta seleccionado.' };
      if (err.status === 409) return { success: false, code: code || 'CONFLICT', message: message || 'El correo ya está registrado.' };
      if (err.status === 400) return { success: false, code: code || 'VALIDATION_ERROR', message: message || 'Datos inválidos.' };
      if (err.status === 404) return { success: false, code: code || 'NOT_FOUND', message: message || 'Recurso no encontrado.' };
      return { success: false, code, message };
    }
    return { success: false, message: fallback };
  }
}
