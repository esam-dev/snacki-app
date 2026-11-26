import { Injectable, signal } from '@angular/core';
import { Punto } from '../shared/geo';

export type EstadoUbicacion = 'inactiva' | 'buscando' | 'activa' | 'denegada' | 'no-disponible';

/** Posición del dispositivo del cliente, compartida por las pantallas que ordenan o miden por cercanía. */
@Injectable({ providedIn: 'root' })
export class UbicacionService {
  readonly posicion = signal<Punto | null>(null);
  readonly estado = signal<EstadoUbicacion>('inactiva');
  private enCurso: Promise<Punto | null> | null = null;

  /** Si el permiso ya fue concedido, obtiene la posición sin mostrar ningún diálogo. */
  async restaurarSiPermitida(): Promise<void> {
    if (this.posicion() || this.enCurso) return;
    try {
      const permiso = await navigator.permissions?.query({ name: 'geolocation' });
      if (permiso?.state === 'granted') await this.solicitar();
      else if (permiso?.state === 'denied') this.estado.set('denegada');
    } catch {
      /* Permissions API no disponible: la posición se pedirá desde el botón */
    }
  }

  /** Pide la posición al dispositivo (puede mostrar el diálogo de permiso). */
  solicitar(): Promise<Punto | null> {
    if (this.enCurso) return this.enCurso;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      this.estado.set('no-disponible');
      return Promise.resolve(null);
    }
    this.estado.set('buscando');
    this.enCurso = new Promise<Punto | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const punto = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.posicion.set(punto);
          this.estado.set('activa');
          resolve(punto);
        },
        (error) => {
          this.estado.set(error.code === error.PERMISSION_DENIED ? 'denegada' : 'no-disponible');
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
      );
    }).finally(() => { this.enCurso = null; });
    return this.enCurso;
  }
}
