import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSearchbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { locationOutline, notificationsOutline, qrCodeOutline } from 'ionicons/icons';
import { Local, Producto, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { AuthService } from '../../services/auth.service';

interface OfertaHome extends Producto {
  comercioId: string;
  comercio: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
  imports: [IonContent, IonIcon, IonSearchbar, DecimalPipe, SnackiHeaderComponent],
})
export class HomePage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);
  private auth = inject(AuthService);

  locales: Local[] = this.stores.getAll();
  resultados: Local[] = this.locales;
  total = this.stores.totalPuntos;
  ofertas: OfertaHome[] = this.obtenerOfertas();

  get nombreUsuario(): string {
    return this.auth.currentUser?.nombre || 'Usuario';
  }

  constructor() {
    addIcons({ qrCodeOutline, notificationsOutline, locationOutline });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  ionViewWillEnter() {
    this.cargarDatos();
  }

  filtrar(event: Event) {
    const query = (event as CustomEvent).detail?.value ?? '';
    this.resultados = this.stores.buscar(query);
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
    this.resultados = this.locales;
    this.total = this.stores.totalPuntos;
    this.ofertas = this.obtenerOfertas();
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
}
