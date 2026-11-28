import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonIcon, IonSearchbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { giftOutline, locationOutline, notificationsOutline, qrCodeOutline } from 'ionicons/icons';
import { Local, Producto, Promo, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { AuthService } from '../../services/auth.service';

interface OfertaHome extends Producto {
  comercioId: string;
  comercio: string;
}

interface PromoHome extends Promo {
  comercioId: string;
  comercio: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, IonIcon, IonSearchbar, DecimalPipe, RouterLink, SnackiHeaderComponent],
})
export class HomePage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);
  private auth = inject(AuthService);

  locales: Local[] = this.stores.getAll();
  resultados: Local[] = this.locales;
  total = this.stores.totalPuntos;
  ofertas: OfertaHome[] = this.obtenerOfertas();
  promos: PromoHome[] = this.obtenerPromos();
  private busqueda = '';

  get nombreUsuario(): string {
    return this.auth.currentUser?.nombre || 'Usuario';
  }

  constructor() {
    addIcons({ qrCodeOutline, notificationsOutline, locationOutline, giftOutline });
    // Cada vez que se descarga el catálogo del servidor se vuelven a leer los datos de la pantalla.
    effect(() => {
      this.stores.catalogoVersion();
      untracked(() => this.cargarDatos());
    });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  ionViewWillEnter() {
    this.cargarDatos();
    void this.stores.refrescar(3000);
  }

  filtrar(event: Event) {
    this.busqueda = (event as CustomEvent).detail?.value ?? '';
    this.resultados = this.stores.buscar(this.busqueda);
  }

  abrirPromo(promo: PromoHome) {
    this.router.navigate(['/tabs/explorar', promo.comercioId]);
  }

  abrirComercio(local: Local) {
    this.router.navigate(['/tabs/explorar', local.id]);
  }

  abrirOferta(oferta: OfertaHome) {
    this.router.navigate(['/tabs/explorar', oferta.comercioId]);
  }

  irA(ruta: string) {
    this.router.navigateByUrl(ruta);
  }

  private cargarDatos() {
    this.locales = this.stores.getAll();
    this.resultados = this.stores.buscar(this.busqueda);
    this.total = this.stores.totalPuntos;
    this.ofertas = this.obtenerOfertas();
    this.promos = this.obtenerPromos();
  }

  private obtenerOfertas(): OfertaHome[] {
    return this.stores.getAll().flatMap((local) =>
      local.productos.map((producto) => ({
        ...producto,
        comercioId: local.id,
        comercio: local.nombre,
      })),
    );
  }

  private obtenerPromos(): PromoHome[] {
    return this.stores.getAll().flatMap((local) =>
      local.promos.map((promo) => ({
        ...promo,
        comercioId: local.id,
        comercio: local.nombre,
      })),
    );
  }
}
