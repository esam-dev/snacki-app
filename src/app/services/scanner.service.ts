import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  BarcodeFormat,
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState,
} from '@capacitor-mlkit/barcode-scanning';

/** Se lanza cuando el usuario no concede el permiso de cámara. */
export class CameraPermissionError extends Error {
  constructor() {
    super('Se necesita permiso de cámara para escanear el código QR.');
    this.name = 'CameraPermissionError';
  }
}

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

    // 1) Primero el permiso de cámara: así el diálogo del sistema siempre aparece.
    await this.asegurarPermisoCamara();

    // 2) En Android el escáner de Google es un módulo que puede requerir instalación.
    if (Capacitor.getPlatform() === 'android') {
      await this.asegurarModuloGoogle();
    }

    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
    return barcodes[0]?.rawValue ?? null;
  }

  /** Abre los ajustes de la app para que el usuario habilite la cámara manualmente. */
  abrirAjustes(): Promise<void> {
    return BarcodeScanner.openSettings();
  }

  private async asegurarPermisoCamara(): Promise<void> {
    let { camera } = await BarcodeScanner.checkPermissions();
    if (camera !== 'granted' && camera !== 'limited') {
      ({ camera } = await BarcodeScanner.requestPermissions());
    }
    if (camera !== 'granted' && camera !== 'limited') {
      throw new CameraPermissionError();
    }
  }

  private async asegurarModuloGoogle(): Promise<void> {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (available) return;

    let terminar: (err?: unknown) => void = () => {};
    const instalado = new Promise<void>((resolve, reject) => {
      terminar = (err?: unknown) => (err ? reject(err) : resolve());
    });

    const listener = await BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (e) => {
      if (e.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
        terminar();
      } else if (
        e.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
        e.state === GoogleBarcodeScannerModuleInstallState.CANCELED
      ) {
        terminar(new Error('No se pudo instalar el módulo del escáner. Intenta de nuevo.'));
      }
    });
    const timeout = setTimeout(
      () => terminar(new Error('El módulo del escáner tarda en instalarse. Revisa tu conexión e intenta de nuevo.')),
      60_000,
    );

    try {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      await instalado;
    } finally {
      clearTimeout(timeout);
      await listener.remove();
    }
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
