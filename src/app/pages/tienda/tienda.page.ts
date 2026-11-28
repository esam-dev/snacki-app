import { ChangeDetectorRef, Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonButton, IonContent } from '@ionic/angular';
import { Local, Producto, StoreService } from '../../services/store.service';
import { UbicacionService } from '../../services/ubicacion.service';
import { Punto, distanciaMetros, esCoordenadaValida, formatearDistancia, urlComoLlegar } from '../../shared/geo';
import { IconComponent } from '../../shared/icon/icon.component';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { MapaMarcador, SnackiMapComponent } from '../../shared/snacki-map/snacki-map.component';

@Component({
  selector: 'app-tienda',
  templateUrl: './tienda.page.html',
  styleUrls: ['./tienda.page.scss'],
  imports: [IonContent, IonButton, DecimalPipe, SnackiHeaderComponent, SnackiMapComponent, IconComponent],
})
export class TiendaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private stores = inject(StoreService);
  private router = inject(Router);
  // App zoneless: los datos llegan por effects y promesas, así que hay que marcar la vista para repintar.
  private cdr = inject(ChangeDetectorRef);
  private alert = inject(AlertController);
  readonly ubicacion = inject(UbicacionService);

  local?: Local = this.stores.getById(this.route.snapshot.paramMap.get('id'));
  /** Ubicación del local (objeto estable: solo cambia si cambian las coordenadas, así el mapa no recentra). */
  punto: Punto | null = null;
  marcadores: MapaMarcador[] = [];

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
    void this.ubicacion.restaurarSiPermitida();
  }

  private cargarLocal() {
    this.local = this.stores.getById(this.route.snapshot.paramMap.get('id'));
    if (!this.local) {
      this.router.navigateByUrl('/tabs/explorar');
      return;
    }
    const { latitud: lat, longitud: lng } = this.local;
    if (!esCoordenadaValida(lat, lng)) {
      this.punto = null;
      this.marcadores = [];
    } else if (this.punto?.lat !== lat || this.punto?.lng !== lng) {
      this.punto = { lat: lat!, lng: lng! };
      this.marcadores = [{ id: this.local.id, ...this.punto, etiqueta: this.local.nombre, activo: true }];
    }
    this.cdr.markForCheck();
  }

  /** Distancia legible desde el cliente hasta el local, o '' si no se conoce. */
  get distancia(): string {
    const yo = this.ubicacion.posicion();
    return yo && this.punto ? formatearDistancia(distanciaMetros(yo, this.punto)) : '';
  }

  get urlComoLlegar(): string {
    return this.punto ? urlComoLlegar(this.punto) : '';
  }

  usarUbicacion() {
    void this.ubicacion.solicitar();
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
