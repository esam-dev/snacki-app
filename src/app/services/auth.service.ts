import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse, AuthSessionData, LoginPayload, MeSessionData, RegisterPayload, SessionUser, UserRole } from '../models/auth.models';
import { TokenStorageService } from './token-storage.service';

export type TipoCuenta = UserRole;
export type SnackiUser = SessionUser;
export interface AuthActionResult { success: boolean; message?: string; code?: string; }

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

  get currentUser() { return this._currentUser(); }

  async restoreSession(): Promise<void> {
    if (this.authStatus() !== 'unknown') return;
    if (this.restorePromise) return this.restorePromise;
    this.restorePromise = (async () => {
      try {
        this.clearLegacy();
        const token = await this.tokenStorage.getToken();
        if (!token) return this.clearSession();
        const res = await firstValueFrom(this.http.get<ApiResponse<MeSessionData>>(`${environment.apiBaseUrl}/api/auth/me`));
        this._currentUser.set(this.toSession(res.data.user, res.data.membership));
        this.authStatus.set('authenticated');
      } catch {
        await this.tokenStorage.clear();
        this.clearSession();
      } finally {
        this.restorePromise = null;
      }
    })();
    return this.restorePromise;
  }

  async ensureSessionResolved() {
    if (this.authStatus() === 'unknown') await this.restoreSession();
  }

  async login(identifier: string, password: string, accountType: TipoCuenta = 'cliente'): Promise<AuthActionResult> {
    const payload: LoginPayload = { identifier: identifier.trim(), password, accountType };
    if (!payload.identifier || !payload.password.trim()) return { success: false, message: 'Completa tu usuario/correo y contraseña.' };
    try {
      const res = await firstValueFrom(this.http.post<ApiResponse<AuthSessionData>>(`${environment.apiBaseUrl}/api/auth/login`, payload));
      await this.applySession(res.data);
      return { success: true };
    } catch (err) { return this.mapError(err, 'No se pudo iniciar sesión.'); }
  }

  async register(nombre: string, correo: string, password: string, tipo: TipoCuenta = 'cliente', comercioId?: string): Promise<AuthActionResult> {
    const payload: RegisterPayload = { fullName: nombre.trim(), email: correo.trim().toLowerCase(), password, accountType: tipo, tenantId: tipo === 'comercio' ? (comercioId || null) : null };
    if (!payload.fullName || !payload.email || !payload.password.trim()) return { success: false, message: 'Completa todos los campos obligatorios.' };
    if (tipo === 'comercio' && !payload.tenantId) return { success: false, message: 'Selecciona el comercio asociado.' };
    try {
      const res = await firstValueFrom(this.http.post<ApiResponse<AuthSessionData>>(`${environment.apiBaseUrl}/api/auth/register`, payload));
      await this.applySession(res.data);
      return { success: true };
    } catch (err) { return this.mapError(err, 'No se pudo crear la cuenta.'); }
  }

  async cerrarSesion() { await this.logout(); }
  async logout() { await this.tokenStorage.clear(); this.clearSession(); }

  private async applySession(data: AuthSessionData) {
    await this.tokenStorage.setToken(data.auth.accessToken);
    this.clearLegacy();
    this._currentUser.set(this.toSession(data.user, data.membership));
    this.authStatus.set('authenticated');
  }

  private clearSession() { this._currentUser.set(null); this.authStatus.set('anonymous'); }
  private clearLegacy() { try { localStorage.removeItem('snacki.current-user'); localStorage.removeItem('snacki.profiles'); } catch {} }

  private toSession(user: AuthSessionData['user'], membership: AuthSessionData['membership']): SessionUser {
    const comercioId = membership.role === 'comercio' ? (membership.tenantSlug || membership.tenantId) : undefined;
    return {
      id: user.id, fullName: user.fullName, email: user.email, role: membership.role,
      tenantId: membership.tenantId, tenantSlug: membership.tenantSlug, tenantName: membership.tenantName,
      nombre: user.fullName, correo: user.email, tipo: membership.role, ...(comercioId ? { comercioId } : {}),
    };
  }

  private mapError(err: unknown, fallback: string): AuthActionResult {
    if (!(err instanceof HttpErrorResponse)) return { success: false, message: fallback };
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
}