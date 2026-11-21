import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, ToastController } from '@ionic/angular';
import { ScannerService } from '../../services/scanner.service';
import { StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

@Component({
  selector: 'app-qr',
  templateUrl: './qr.page.html',
  styleUrls: ['./qr.page.scss'],
  imports: [IonContent, IonButton, SnackiHeaderComponent],
})
export class QrPage {
  private scanner = inject(ScannerService);
  private stores = inject(StoreService);
  private router = inject(Router);
  private toast = inject(ToastController);

  escaneando = false;

  async escanear() {
    if (this.escaneando) return;
    this.escaneando = true;
    try {
      const valor = await this.scanner.scan();
      if (!valor) return;

      const compra = this.scanner.extraerCompra(valor);
      if (compra) {
        const local = this.stores.getById(compra.localId);
        if (!local) {
          await this.mostrar('El QR pertenece a un comercio que no está disponible.');
          return;
        }
        const resultado = this.stores.acreditarCompra(compra.localId, compra.purchaseId, compra.puntos);
        if (resultado === 'ok') {
          await this.mostrar(`¡Compra registrada! Sumaste ${compra.puntos.toLocaleString('es')} puntos en ${local.nombre}. Saldo: ${this.stores.getById(compra.localId)?.puntos.toLocaleString('es')} PTS.`);
        } else if (resultado === 'duplicado') {
          await this.mostrar('Este QR de compra ya fue utilizado.');
        } else {
          await this.mostrar('El QR de compra no es válido.');
        }
        return;
      }

      const id = this.scanner.extraerLocalId(valor);
      if (id && this.stores.getById(id)) {
        this.router.navigate(['/tabs/explorar', id]);
      } else {
        await this.mostrar('QR no reconocido. Pide al comercio su QR de compra Snacki.');
      }
    } catch (e: any) {
      await this.mostrar(e?.message ?? 'No se pudo escanear el código QR.');
    } finally {
      this.escaneando = false;
    }
  }

  private async mostrar(message: string) {
    const t = await this.toast.create({ message, duration: 2800, position: 'top' });
    await t.present();
  }
}
