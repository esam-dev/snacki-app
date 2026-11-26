export type UserRole = 'cliente' | 'comercio';
/** Titular (cuenta que creó el local) o asistente (sucursal: sus cambios de catálogo requieren aprobación). */
export type StaffRole = 'owner' | 'assistant';

export interface AuthSessionData {
  user: { id: string; fullName: string; email: string; isActive: boolean };
  membership: { role: UserRole; staffRole?: StaffRole; tenantId: string; tenantSlug?: string; tenantName?: string };
  auth: { accessToken: string; tokenType: 'Bearer'; expiresIn: number };
}

export interface MeSessionData {
  user: AuthSessionData['user'];
  membership: AuthSessionData['membership'];
  session?: { issuedAt?: string; expiresAt?: string };
}

export interface ApiResponse<T> { data: T; }

export interface LoginPayload {
  identifier: string;
  password: string;
  accountType: UserRole;
}

export interface RegisterPayload {
  fullName: string;
  email: string;
  password: string;
  accountType: UserRole;
  /** Comercio: `new` crea un local propio; `branch` se une como sucursal (asistente) de `tenantId`. */
  businessMode?: 'new' | 'branch';
  tenantId?: string | null;
  tenantName?: string;
  category?: string;
}

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
  /** Solo comercio: 'owner' por defecto. */
  staffRole?: StaffRole;
  // Compatibility fields for existing UI/services during migration
  nombre: string;
  correo: string;
  tipo: UserRole;
  comercioId?: string;
}