import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonButton, IonContent, ToastController } from '@ionic/angular';
import { Local, Producto, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

@Component({
  selector: 'app-tienda',
  templateUrl: './tienda.page.html',
  styleUrls: ['./tienda.page.scss'],
  imports: [IonContent, IonButton, DecimalPipe, SnackiHeaderComponent],
})
export class TiendaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private stores = inject(StoreService);
  private router = inject(Router);
  private alert = inject(AlertController);
  private toast = inject(ToastController);

  local?: Local = this.stores.getById(this.route.snapshot.paramMap.get('id'));
  canjeando = false;

  constructor() {
    // Repinta la tienda cuando el comercio cambia sus promos o recompensas.
    effect(() => {
      this.stores.catalogoVersion();
      untracked(() => this.cargarLocal());
    });
  }

  ngOnInit() {
    this.cargarLocal();
  }

  ionViewWillEnter() {
    this.cargarLocal();
    void this.stores.refrescarCatalogo(3000);
  }

  private cargarLocal() {
    this.local = this.stores.getById(this.route.snapshot.paramMap.get('id'));
    if (!this.local) this.router.navigateByUrl('/tabs/explorar');
  }

  mostrarQr() {
    this.router.navigateByUrl('/tabs/qr');
  }

  async canjear(producto: Producto) {
    if (!this.local || this.canjeando) return;
    this.canjeando = true;
    try {
      const localId = this.local.id;
      const confirmacion = await this.alert.create({
        header: 'Confirmar canje',
        message: `¿Canjear ${producto.nombre} por ${producto.puntos.toLocaleString('es')} puntos de ${this.local.nombre}?`,
        buttons: [
          { text: 'Cancelar', role: 'cancel' },
          { text: 'Canjear', role: 'confirm' },
        ],
      });
      await confirmacion.present();
      const { role } = await confirmacion.onDidDismiss();
      if (role !== 'confirm') return;

      const resultado = this.stores.canjear(localId, producto);
      const mensaje = resultado === 'ok'
        ? `Canje realizado. Te quedan ${this.stores.getById(localId)?.puntos.toLocaleString('es')} puntos en ${this.local.nombre}.`
        : resultado === 'saldo-insuficiente'
          ? `Te faltan puntos para canjear este producto en ${this.local.nombre}.`
          : 'No se pudo procesar el canje.';
      this.local = this.stores.getById(localId);
      const toast = await this.toast.create({ message: mensaje, duration: 2800, position: 'top' });
      await toast.present();
    } finally {
      this.canjeando = false;
    }
  }
}
