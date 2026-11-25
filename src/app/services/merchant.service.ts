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

@Injectable({ providedIn: 'root' })
export class MerchantService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/api/merchant`;

  // Products
  async listProducts(): Promise<MerchantProduct[]> {
    const res = await firstValueFrom(this.http.get<{ data: { products: MerchantProduct[] } }>(`${this.base}/products`));
    return res.data.products;
  }

  async createProduct(payload: { name: string; description?: string | null; points: number; imageUrl?: string | null; promoStartsAt: string; promoEndsAt: string; isActive?: boolean }): Promise<MerchantProduct> {
    const res = await firstValueFrom(this.http.post<{ data: { product: MerchantProduct } }>(`${this.base}/products`, payload));
    return res.data.product;
  }

  async updateProduct(id: string, payload: Partial<{ name: string; description?: string | null; points: number; imageUrl?: string | null; promoStartsAt: string; promoEndsAt: string; isActive: boolean }>): Promise<MerchantProduct> {
    const res = await firstValueFrom(this.http.patch<{ data: { product: MerchantProduct } }>(`${this.base}/products/${id}`, payload));
    return res.data.product;
  }

  /** `archived`: tenía historial (ventas/canjes), así que se archivó en vez de borrarse. */
  async deleteProduct(id: string): Promise<{ archived: boolean }> {
    const res = await firstValueFrom(this.http.delete<{ data: { ok: boolean; archived?: boolean } }>(`${this.base}/products/${id}`));
    return { archived: !!res?.data?.archived };
  }

  // Rewards
  async listRewards(): Promise<MerchantReward[]> {
    const res = await firstValueFrom(this.http.get<{ data: { rewards: MerchantReward[] } }>(`${this.base}/rewards`));
    return res.data.rewards;
  }

  async createReward(payload: { name: string; description?: string | null; cost: number; imageUrl?: string | null; isActive?: boolean }): Promise<MerchantReward> {
    const res = await firstValueFrom(this.http.post<{ data: { reward: MerchantReward } }>(`${this.base}/rewards`, payload));
    return res.data.reward;
  }

  async updateReward(id: string, payload: Partial<{ name: string; description?: string | null; cost: number; imageUrl?: string | null; isActive: boolean }>): Promise<MerchantReward> {
    const res = await firstValueFrom(this.http.patch<{ data: { reward: MerchantReward } }>(`${this.base}/rewards/${id}`, payload));
    return res.data.reward;
  }

  /** `archived`: tenía historial (ventas/canjes), así que se archivó en vez de borrarse. */
  async deleteReward(id: string): Promise<{ archived: boolean }> {
    const res = await firstValueFrom(this.http.delete<{ data: { ok: boolean; archived?: boolean } }>(`${this.base}/rewards/${id}`));
    return { archived: !!res?.data?.archived };
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

  // Settings
  async getSettings(): Promise<MerchantSettings> {
    const res = await firstValueFrom(this.http.get<{ data: { settings: MerchantSettings } }>(`${this.base}/settings`));
    return res.data.settings;
  }

  async updateSettings(payload: Partial<{ name: string; category: string; address?: string | null; latitude?: number | null; longitude?: number | null; logoUrl?: string | null; pointsExpireAt?: string | null }>): Promise<MerchantSettings> {
    const res = await firstValueFrom(this.http.patch<{ data: { settings: MerchantSettings } }>(`${this.base}/settings`, payload));
    return res.data.settings;
  }
}
