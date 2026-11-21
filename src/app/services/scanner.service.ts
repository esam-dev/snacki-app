import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

export interface PurchaseQr {
  localId: string;
  purchaseId: string;
  puntos: number;
}

@Injectable({ providedIn: 'root' })
export class ScannerService {
  /** Abre la cámara y devuelve el texto del QR leído (o null si se cancela). */
  async scan(): Promise<string | null> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('El escáner QR solo funciona en un dispositivo Android o iOS.');
    }

    // En Android el escáner de Google es un módulo que puede requerir instalación.
    if (Capacitor.getPlatform() === 'android') {
      const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!available) {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
        throw new Error('Se está instalando el módulo del escáner. Intenta de nuevo en unos segundos.');
      }
    }

    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      throw new Error('Se necesita permiso de cámara para escanear el código QR.');
    }

    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue ?? null;
  }

  /** QR informativo: snacki://local/<id>. */
  extraerLocalId(valor: string): string | null {
    const match = /^snacki:\/\/local\/([a-z0-9-]+)$/.exec(valor.trim());
    return match?.[1] ?? null;
  }

  /** QR de compra de demostración: snacki://purchase/<localId>?id=<id>&points=<puntos>. */
  extraerCompra(valor: string): PurchaseQr | null {
    try {
      const url = new URL(valor.trim());
      if (url.protocol !== 'snacki:' || url.hostname !== 'purchase') return null;
      const localId = url.pathname.replace(/^\//, '');
      if (!/^[a-z0-9-]+$/.test(localId)) return null;

      const purchaseId = (url.searchParams.get('id') || '').trim();
      if (!purchaseId || purchaseId.length > 120) return null;

      const rawPoints = url.searchParams.get('points');
      if (rawPoints === null || !/^\d+$/.test(rawPoints)) return null;
      const puntos = Number(rawPoints);
      if (!Number.isSafeInteger(puntos) || puntos < 1 || puntos > 100000) return null;

      return { localId, purchaseId, puntos };
    } catch {
      return null;
    }
  }
}
