import { ChangeDetectorRef, Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSearchbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline, giftOutline, locationOutline, pricetagOutline, storefrontOutline } from 'ionicons/icons';
import { Local, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

/** Nombres visibles de las categorías del backend (`TenantCategory`). */
const CATEGORIAS: Record<string, string> = {
  comida_rapida: 'Comida rápida',
  pizza: 'Pizza',
  cafe: 'Café',
  helado: 'Helados',
  otro: 'Otros',
};

interface Filtro { id: string; nombre: string; }

@Component({
  selector: 'app-explorar',
  templateUrl: './explorar.page.html',
  styleUrls: ['./explorar.page.scss'],
  imports: [IonContent, IonIcon, IonSearchbar, DecimalPipe, SnackiHeaderComponent],
})
export class ExplorarPage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);
  // App zoneless: los datos llegan por effects y promesas, así que hay que marcar la vista para repintar.
  private cdr = inject(ChangeDetectorRef);

  locales: Local[] = [];
  resultados: Local[] = [];
  filtros: Filtro[] = [];
  categoria = 'todas';
  total = 0;
  usaWallet = false;
  private busqueda = '';

  constructor() {
    addIcons({ cardOutline, giftOutline, locationOutline, pricetagOutline, storefrontOutline });
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

  buscar(event: Event) {
    this.busqueda = ((event as CustomEvent).detail?.value ?? '').trim().toLowerCase();
    this.aplicarFiltros();
  }

  elegirCategoria(id: string) {
    this.categoria = id;
    this.aplicarFiltros();
  }

  nombreCategoria(local: Local): string {
    return local.categoria ? CATEGORIAS[local.categoria] ?? CATEGORIAS['otro'] : '';
  }

  /** Ancho de la barra de progreso hacia la próxima recompensa (0–100). */
  progreso(local: Local): number {
    const p = local.siguienteRecompensa?.progreso ?? (local.canjeables ? 1 : 0);
    return Math.max(0, Math.min(100, Math.round(p * 100)));
  }

  abrir(local: Local) {
    this.router.navigate(['/tabs/explorar', local.id]);
  }

  private cargarDatos() {
    this.usaWallet = this.stores.usaWallet;
    this.locales = this.stores.getAll();
    this.total = this.stores.totalPuntos;
    const presentes = [...new Set(this.locales.map((l) => l.categoria).filter((c): c is string => !!c))];
    this.filtros = presentes
      .map((id) => ({ id, nombre: CATEGORIAS[id] ?? CATEGORIAS['otro'] }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
    if (this.categoria !== 'todas' && !presentes.includes(this.categoria)) this.categoria = 'todas';
    this.aplicarFiltros();
  }

  private aplicarFiltros() {
    this.resultados = this.locales
      .filter((l) => this.categoria === 'todas' || l.categoria === this.categoria)
      .filter((l) => !this.busqueda || l.nombre.toLowerCase().includes(this.busqueda) || (l.direccion ?? '').toLowerCase().includes(this.busqueda))
      // Primero donde el cliente ya tiene puntos.
      .sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));
    this.cdr.markForCheck();
  }
}
