import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { TimeoutError, firstValueFrom, timeout } from 'rxjs';
import { ApiResponse, AuthSessionData, LoginPayload, MeSessionData, RegisterPayload, SessionUser, UserRole } from '../models/auth.models';
import { AppConfigService } from './app-config.service';
import { TokenStorageService } from './token-storage.service';

export type TipoCuenta = UserRole;
export type SnackiUser = SessionUser;
export interface AuthActionResult { success: boolean; message?: string; code?: string; }

/** Si el servidor no responde, el intento se da por fallido y la pantalla vuelve al formulario. */
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly config = inject(AppConfigService);
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
        const res = await firstValueFrom(this.http.get<ApiResponse<MeSessionData>>(`${this.config.apiBaseUrl}/api/auth/me`));
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
      const res = await firstValueFrom(this.http.post<ApiResponse<AuthSessionData>>(`${this.config.apiBaseUrl}/api/auth/login`, payload).pipe(timeout(AUTH_REQUEST_TIMEOUT_MS)));
      await this.applySession(res.data);
      return { success: true };
    } catch (err) { return this.mapError(err, 'No se pudo iniciar sesión.'); }
  }

  /**
   * Comercio: con `localNuevo` se crea un local propio (titular); con `comercioId` se registra como sucursal
   * (asistente) de ese comercio.
   */
  async register(nombre: string, correo: string, password: string, tipo: TipoCuenta = 'cliente', comercioId?: string, localNuevo?: { nombre: string; categoria?: string }): Promise<AuthActionResult> {
    const payload: RegisterPayload = { fullName: nombre.trim(), email: correo.trim().toLowerCase(), password, accountType: tipo, tenantId: null };
    if (tipo === 'comercio') {
      if (localNuevo) {
        payload.businessMode = 'new';
        payload.tenantName = localNuevo.nombre.trim();
        if (localNuevo.categoria) payload.category = localNuevo.categoria;
      } else {
        payload.businessMode = 'branch';
        payload.tenantId = comercioId || null;
      }
    }
    if (!payload.fullName || !payload.email || !payload.password.trim()) return { success: false, message: 'Completa todos los campos obligatorios.' };
    if (payload.businessMode === 'new' && !payload.tenantName) return { success: false, message: 'Escribe el nombre de tu local.' };
    if (payload.businessMode === 'branch' && !payload.tenantId) return { success: false, message: 'Selecciona el comercio asociado.' };
    try {
      const res = await firstValueFrom(this.http.post<ApiResponse<AuthSessionData>>(`${this.config.apiBaseUrl}/api/auth/register`, payload).pipe(timeout(AUTH_REQUEST_TIMEOUT_MS)));
      await this.applySession(res.data);
      return { success: true };
    } catch (err) { return this.mapError(err, 'No se pudo crear la cuenta.'); }
  }

  async cerrarSesion() { await this.logout(); }
  async logout() {
    // El estado en memoria se limpia primero: un fallo del almacenamiento no debe impedir cerrar sesión.
    this.clearSession();
    this.restorePromise = null;
    try { await this.tokenStorage.clear(); } catch { /* la sesión en memoria ya quedó anónima; el guard no deja pasar sin usuario */ }
  }

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
      ...(membership.role === 'comercio' ? { staffRole: membership.staffRole ?? 'owner' } : {}),
      nombre: user.fullName, correo: user.email, tipo: membership.role, ...(comercioId ? { comercioId } : {}),
    };
  }

  private mapError(err: unknown, fallback: string): AuthActionResult {
    const sinConexion = 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    if (err instanceof TimeoutError) return { success: false, code: 'TIMEOUT', message: sinConexion };
    if (!(err instanceof HttpErrorResponse)) return { success: false, message: fallback };
    if (err.status === 0) return { success: false, code: 'NETWORK_ERROR', message: sinConexion };
    const api = err.error?.error;
    const code = api?.code as string | undefined;
    const message = (api?.message as string | undefined) || fallback;
    if (err.status === 401) return { success: false, code: code || 'UNAUTHORIZED', message: 'Credenciales inválidas o sesión expirada.' };
    if (err.status === 403) return { success: false, code: code || 'FORBIDDEN', message: message || 'No tienes acceso con el tipo de cuenta seleccionado.' };
    if (err.status === 409) return { success: false, code: code || 'CONFLICT', message: message || 'El correo ya está registrado.' };
    if (err.status === 400) return { success: false, code: code || 'VALIDATION_ERROR', message: message || 'Datos inválidos.' };
    if (err.status === 404) return { success: false, code: code || 'NOT_FOUND', message: message || 'Recurso no encontrado.' };
    return { success: false, code, message: err.status >= 500 ? 'El servidor no pudo procesar la solicitud. Inténtalo más tarde.' : message };
  }
}