import { ChangeDetectorRef, Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonButton, IonContent } from '@ionic/angular';
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
  // App zoneless: los datos llegan por effects y promesas, así que hay que marcar la vista para repintar.
  private cdr = inject(ChangeDetectorRef);
  private alert = inject(AlertController);

  local?: Local = this.stores.getById(this.route.snapshot.paramMap.get('id'));

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
    void this.stores.refrescar(3000);
  }

  private cargarLocal() {
    this.local = this.stores.getById(this.route.snapshot.paramMap.get('id'));
    if (!this.local) this.router.navigateByUrl('/tabs/explorar');
    this.cdr.markForCheck();
  }

  invitar() {
    if (this.local) this.router.navigate(['/tabs/referidos'], { queryParams: { local: this.local.id } });
  }

  mostrarQr() {
    this.router.navigateByUrl('/tabs/qr');
  }

  /** El canje solo se hace escaneando el QR de canje del comercio (ver QrPage): aquí solo se explica cómo. */
  async canjear(producto: Producto) {
    if (!this.local) return;
    const faltan = producto.puntos - this.local.puntos;
    const mensaje = faltan > 0
      ? `Te faltan ${faltan.toLocaleString('es')} puntos en ${this.local.nombre} para ${producto.nombre}.`
      : `Para canjear ${producto.nombre}, pide en ${this.local.nombre} su QR de canje y escanéalo. Los puntos se descuentan solo cuando confirmas.`;
    const aviso = await this.alert.create({
      header: 'Canjea en el local',
      message: mensaje,
      buttons: faltan > 0
        ? [{ text: 'Entendido', role: 'cancel' }]
        : [{ text: 'Ahora no', role: 'cancel' }, { text: 'Escanear QR', role: 'confirm' }],
    });
    await aviso.present();
    const { role } = await aviso.onDidDismiss();
    if (role === 'confirm') this.router.navigateByUrl('/tabs/qr');
  }
}
