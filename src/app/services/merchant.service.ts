import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MerchantProduct {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  points: number;
  imageUrl?: string | null;
  promoStartsAt: string;
  promoEndsAt: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantReward {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
  cost: number;
  imageUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantSettings {
  id: string;
  name: string;
  slug: string;
  category: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  logoUrl?: string | null;
  pointsExpireAt?: string | null;
  isActive: boolean;
}

/** QR de compra emitido por el comercio. `qrContent` es lo que se codifica en la imagen. */
export interface MerchantQr {
  claimId: string;
  token: string;
  qrContent: string;
  expiresAt: string;
  points: number;
  quantity: number;
  product: { id: string; name: string; points: number };
}

export type MerchantQrStatus = 'pending' | 'claimed' | 'expired';

export type ChangeStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Cambio de promo/recompensa propuesto por una sucursal (asistente), a la espera de un titular. */
export interface ChangeRequest {
  id: string;
  entity: 'product' | 'reward';
  action: 'create' | 'update' | 'delete';
  targetId: string | null;
  targetName: string | null;
  payload: Record<string, unknown> | null;
  status: ChangeStatus;
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; fullName: string; email: string };
  reviewedBy: { id: string; fullName: string } | null;
}

/** Respuesta 202 del servidor cuando quien guarda es un asistente: el cambio aún no se aplicó. */
export interface PendingChange { pending: true; request: ChangeRequest; }

export function esPendiente(res: unknown): res is PendingChange {
  return !!res && typeof res === 'object' && (res as { pending?: unknown }).pending === true;
}

@Injectable({ providedIn: 'root' })
export class MerchantService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/merchant`;

  // Products
  async listProducts(): Promise<MerchantProduct[]> {
    const res = await firstValueFrom(this.http.get<{ data: { products: MerchantProduct[] } }>(`${this.base}/products`));
    return res.data.products;
  }

  async createProduct(payload: { name: string; description?: string | null; points: number; imageUrl?: string | null; promoStartsAt: string; promoEndsAt: string; isActive?: boolean }): Promise<MerchantProduct | PendingChange> {
    const res = await firstValueFrom(this.http.post<{ data: { product: MerchantProduct } | PendingChange }>(`${this.base}/products`, payload));
    return esPendiente(res.data) ? res.data : res.data.product;
  }

  async updateProduct(id: string, payload: Partial<{ name: string; description?: string | null; points: number; imageUrl?: string | null; promoStartsAt: string; promoEndsAt: string; isActive: boolean }>): Promise<MerchantProduct | PendingChange> {
    const res = await firstValueFrom(this.http.patch<{ data: { product: MerchantProduct } | PendingChange }>(`${this.base}/products/${id}`, payload));
    return esPendiente(res.data) ? res.data : res.data.product;
  }

  /** `archived`: tenía historial (ventas/canjes), así que se archivó en vez de borrarse. */
  async deleteProduct(id: string): Promise<{ archived: boolean } | PendingChange> {
    const res = await firstValueFrom(this.http.delete<{ data: { ok: boolean; archived?: boolean } | PendingChange }>(`${this.base}/products/${id}`));
    return esPendiente(res?.data) ? res.data : { archived: !!(res?.data as { archived?: boolean })?.archived };
  }

  // Rewards
  async listRewards(): Promise<MerchantReward[]> {
    const res = await firstValueFrom(this.http.get<{ data: { rewards: MerchantReward[] } }>(`${this.base}/rewards`));
    return res.data.rewards;
  }

  async createReward(payload: { name: string; description?: string | null; cost: number; imageUrl?: string | null; isActive?: boolean }): Promise<MerchantReward | PendingChange> {
    const res = await firstValueFrom(this.http.post<{ data: { reward: MerchantReward } | PendingChange }>(`${this.base}/rewards`, payload));
    return esPendiente(res.data) ? res.data : res.data.reward;
  }

  async updateReward(id: string, payload: Partial<{ name: string; description?: string | null; cost: number; imageUrl?: string | null; isActive: boolean }>): Promise<MerchantReward | PendingChange> {
    const res = await firstValueFrom(this.http.patch<{ data: { reward: MerchantReward } | PendingChange }>(`${this.base}/rewards/${id}`, payload));
    return esPendiente(res.data) ? res.data : res.data.reward;
  }

  /** `archived`: tenía historial (ventas/canjes), así que se archivó en vez de borrarse. */
  async deleteReward(id: string): Promise<{ archived: boolean } | PendingChange> {
    const res = await firstValueFrom(this.http.delete<{ data: { ok: boolean; archived?: boolean } | PendingChange }>(`${this.base}/rewards/${id}`));
    return esPendiente(res?.data) ? res.data : { archived: !!(res?.data as { archived?: boolean })?.archived };
  }

  // QR de compra
  async createQr(productId: string, quantity: number): Promise<MerchantQr> {
    const res = await firstValueFrom(this.http.post<{ data: MerchantQr }>(`${this.base}/qr`, { productId, quantity }));
    return res.data;
  }

  async getQrStatus(claimId: string): Promise<{ status: MerchantQrStatus; claimedAt: string | null; expiresAt: string }> {
    const res = await firstValueFrom(
      this.http.get<{ data: { status: MerchantQrStatus; claimedAt: string | null; expiresAt: string } }>(`${this.base}/qr/${claimId}`),
    );
    return res.data;
  }

  /** Anula un QR aún no canjeado (venta cancelada o generado por error). */
  async voidQr(claimId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/qr/${claimId}/void`, {}));
  }

  // QR de canje: el cliente lo escanea en el local para gastar sus puntos en la recompensa.
  /** Se devuelve con la misma forma que el QR de venta para reutilizar la pantalla del QR. */
  async createRedeemQr(rewardId: string): Promise<MerchantQr> {
    const res = await firstValueFrom(
      this.http.post<{ data: { qrId: string; token: string; qrContent: string; expiresAt: string; cost: number; reward: { id: string; name: string; cost: number } } }>(
        `${this.base}/redeem-qr`, { rewardId },
      ),
    );
    const d = res.data;
    return {
      claimId: d.qrId, token: d.token, qrContent: d.qrContent, expiresAt: d.expiresAt,
      points: d.cost, quantity: 1, product: { id: d.reward.id, name: d.reward.name, points: d.cost },
    };
  }

  async getRedeemQrStatus(qrId: string): Promise<{ status: MerchantQrStatus; customerName: string | null; code: string | null }> {
    const res = await firstValueFrom(
      this.http.get<{ data: { status: MerchantQrStatus; customerName: string | null; code: string | null } }>(`${this.base}/redeem-qr/${qrId}`),
    );
    return res.data;
  }

  async voidRedeemQr(qrId: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/redeem-qr/${qrId}/void`, {}));
  }

  // Settings
  async getSettings(): Promise<MerchantSettings> {
    const res = await firstValueFrom(this.http.get<{ data: { settings: MerchantSettings } }>(`${this.base}/settings`));
    return res.data.settings;
  }

  async updateSettings(payload: Partial<{ name: string; category: string; address?: string | null; latitude?: number | null; longitude?: number | null; logoUrl?: string | null; pointsExpireAt?: string | null }>): Promise<MerchantSettings> {
    const res = await firstValueFrom(this.http.patch<{ data: { settings: MerchantSettings } }>(`${this.base}/settings`, payload));
    return res.data.settings;
  }

  // Solicitudes de cambio (sucursales)
  /** Titular: todas las del local. Asistente: solo las suyas. `pending` cuenta las que esperan aprobación. */
  async listChangeRequests(status?: ChangeStatus): Promise<{ requests: ChangeRequest[]; pending: number }> {
    const res = await firstValueFrom(this.http.get<{ data: { requests: ChangeRequest[]; pending: number } }>(
      `${this.base}/change-requests`, status ? { params: { status } } : {},
    ));
    return { requests: res.data.requests, pending: res.data.pending };
  }

  async approveChange(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/change-requests/${id}/approve`, {}));
  }

  async rejectChange(id: string, reason?: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.base}/change-requests/${id}/reject`, { reason: reason?.trim() || undefined }));
  }
}
