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

      const id = this.scanner.extraerLocalId(valor);
      if (id && this.stores.getById(id)) {
        this.router.navigate(['/tabs/explorar', id]);
      } else {
        await this.mostrar('El código QR no pertenece a un local de Snacki.');
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
