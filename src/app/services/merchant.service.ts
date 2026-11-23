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

  async deleteProduct(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/products/${id}`));
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

  async deleteReward(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.base}/rewards/${id}`));
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
