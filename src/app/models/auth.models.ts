export type UserRole = 'cliente' | 'comercio';

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
}

export interface AuthMembership {
  role: UserRole;
  tenantId: string;
  tenantSlug?: string;
  tenantName?: string;
}

export interface AuthToken {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

export interface AuthSessionData {
  user: AuthUser;
  membership: AuthMembership;
  auth: AuthToken;
}

export interface MeSessionData {
  user: AuthUser;
  membership: AuthMembership;
  session?: {
    issuedAt?: string;
    expiresAt?: string;
  };
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message?: string }> | unknown;
  };
}

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
