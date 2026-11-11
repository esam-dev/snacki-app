import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';

/**
 * Formato de los QR de los locales: snacki://local/<id>
 * Ejemplo: snacki://local/burger-house
 */
const QR_PREFIX = 'snacki://local/';

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

  /** Extrae el id del local desde el contenido del QR. */
  extraerLocalId(valor: string): string | null {
    return valor.startsWith(QR_PREFIX) ? valor.substring(QR_PREFIX.length) : null;
  }
}
