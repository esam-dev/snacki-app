import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface RuntimeConfig {
  apiBaseUrl?: unknown;
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly http = inject(HttpClient);
  private apiBaseUrlValue = environment.apiBaseUrl;
  private loadPromise: Promise<void> | null = null;

  get apiBaseUrl(): string {
    return this.apiBaseUrlValue;
  }

  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = firstValueFrom(this.http.get<RuntimeConfig>('assets/config.json'))
        .then((config) => {
          const value = typeof config?.apiBaseUrl === 'string' ? config.apiBaseUrl.trim().replace(/\/+$/, '') : '';
          if (!value) throw new Error('Falta apiBaseUrl en assets/config.json');
          const parsed = new URL(value);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error(`apiBaseUrl no válida: ${value}`);
          this.apiBaseUrlValue = value;
        })
        .catch((error) => {
          this.loadPromise = null;
          throw error;
        });
    }
    return this.loadPromise;
  }
}
