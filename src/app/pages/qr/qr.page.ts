import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AlertController, IonButton, IonContent, ToastController } from '@ionic/angular';
import { ScannerService } from '../../services/scanner.service';
import { StoreService } from '../../services/store.service';
import { WalletService, esQrDeCanje, esQrDeCompra } from '../../services/wallet.service';
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
  private wallet = inject(WalletService);
  private router = inject(Router);
  private toast = inject(ToastController);
  private alert = inject(AlertController);

  escaneando = false;

  async escanear() {
    if (this.escaneando) return;
    this.escaneando = true;
    try {
      const valor = await this.scanner.scan();
      if (!valor) return;
      await this.procesar(valor);
    } catch (e: any) {
      await this.mostrar(e?.message ?? 'No se pudo escanear el código QR.');
    } finally {
      this.escaneando = false;
    }
  }

  /** Procesa el texto leído de un QR (separado del escáner para poder probarlo sin cámara). */
  async procesar(valor: string) {
    // QR de compra firmado por el comercio: el servidor valida y acredita una sola vez.
    if (esQrDeCompra(valor)) {
      const r = await this.wallet.escanear(valor);
      if (r.ok) {
        const saldo = r.saldo !== null ? ` Saldo en ${r.comercio}: ${r.saldo.toLocaleString('es')} PTS.` : '';
        await this.mostrar(`¡Compra registrada! Sumaste ${r.puntos.toLocaleString('es')} puntos en ${r.comercio}.${saldo}`);
        this.router.navigateByUrl('/tabs/puntos');
      } else {
        await this.mostrar(r.mensaje);
      }
      return;
    }

    // QR de canje: única forma de gastar puntos, así el cliente tiene que estar en el local.
    if (esQrDeCanje(valor)) {
      await this.canjear(valor);
      return;
    }

    const id = this.scanner.extraerLocalId(valor);
    if (id && this.stores.getById(id)) {
      this.router.navigate(['/tabs/explorar', id]);
    } else {
      await this.mostrar('QR no reconocido. Pide al comercio su QR de compra Snacki.');
    }
  }

  private async canjear(valor: string) {
    const previa = await this.wallet.previsualizarCanje(valor);
    if (!previa.ok) {
      await this.mostrar(previa.mensaje);
      return;
    }
    const v = previa.vista;
    if (!v.alcanza) {
      await this.mostrar(`Te faltan ${(v.costo - v.saldo).toLocaleString('es')} puntos en ${v.comercio} para ${v.recompensa}.`);
      return;
    }

    const confirmacion = await this.alert.create({
      header: 'Confirmar canje',
      message: `¿Canjear ${v.recompensa} por ${v.costo.toLocaleString('es')} puntos de ${v.comercio}? Tu saldo ahí es ${v.saldo.toLocaleString('es')} PTS.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Canjear', role: 'confirm' },
      ],
    });
    await confirmacion.present();
    const { role } = await confirmacion.onDidDismiss();
    if (role !== 'confirm') return;

    const r = await this.wallet.canjear(valor);
    if (r.ok) {
      await this.mostrar(`¡Canje listo! ${r.recompensa} en ${r.comercio} (código ${r.codigo}). Te quedan ${r.saldo.toLocaleString('es')} PTS.`);
      this.router.navigateByUrl('/tabs/puntos');
    } else {
      await this.mostrar(r.mensaje);
    }
  }

  private async mostrar(message: string) {
    const t = await this.toast.create({ message, duration: 3200, position: 'top' });
    await t.present();
  }
}
