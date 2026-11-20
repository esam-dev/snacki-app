import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { Local, Producto, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

@Component({
  selector: 'app-comercio',
  templateUrl: './comercio.page.html',
  styleUrls: ['./comercio.page.scss'],
  imports: [IonContent, IonButton, IonInput, FormsModule, DecimalPipe, SnackiHeaderComponent],
})
export class ComercioPage {
  private auth = inject(AuthService);
  private stores = inject(StoreService);
  private router = inject(Router);
  private toast = inject(ToastController);

  comercio?: Local = this.stores.getById(this.auth.currentUser?.comercioId);
  nombreRecompensa = '';
  costoPuntos: number | string | null = null;
  agregando = false;

  ionViewWillEnter() {
    this.comercio = this.stores.getById(this.auth.currentUser?.comercioId);
  }

  async agregarRecompensa() {
    if (this.agregando) return;
    this.agregando = true;
    try {
      const puntos = Number(this.costoPuntos);
      const costoValido = Number.isInteger(puntos) && puntos > 0 && puntos <= 100000;
      if (!this.comercio || !costoValido || !this.stores.agregarRecompensa(this.comercio.id, this.nombreRecompensa, puntos)) {
        await this.mostrar('Revisa el nombre y el costo en puntos. No repitas el nombre de otra recompensa.');
        return;
      }
      this.nombreRecompensa = '';
      this.costoPuntos = null;
      this.comercio = this.stores.getById(this.comercio.id);
      await this.mostrar('Recompensa agregada al catálogo.');
    } finally {
      this.agregando = false;
    }
  }

  async eliminarRecompensa(producto: Producto) {
    if (!this.comercio || !this.stores.eliminarRecompensa(this.comercio.id, producto.nombre)) {
      await this.mostrar('Las recompensas iniciales de la demo no se pueden eliminar.');
      return;
    }
    this.comercio = this.stores.getById(this.comercio.id);
    await this.mostrar('Recompensa eliminada.');
  }

  cerrarSesion() {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/login');
  }

  private async mostrar(message: string) {
    const toast = await this.toast.create({ message, duration: 2600, position: 'top' });
    await toast.present();
  }
}
