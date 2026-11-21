export type UserRole = 'cliente' | 'comercio';

export interface AuthSessionData {
  user: { id: string; fullName: string; email: string; isActive: boolean };
  membership: { role: UserRole; tenantId: string; tenantSlug?: string; tenantName?: string };
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
  tenantId?: string | null;
}

export interface SessionUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
  // Compatibility fields for existing UI/services during migration
  nombre: string;
  correo: string;
  tipo: UserRole;
  comercioId?: string;
}