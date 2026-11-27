import { ChangeDetectorRef, Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, IonSearchbar } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline, giftOutline, locationOutline, pricetagOutline, storefrontOutline } from 'ionicons/icons';
import { Local, StoreService } from '../../services/store.service';
import { UbicacionService } from '../../services/ubicacion.service';
import { Punto, distanciaMetros, esCoordenadaValida, formatearDistancia } from '../../shared/geo';
import { IconComponent } from '../../shared/icon/icon.component';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { MapaMarcador, SnackiMapComponent } from '../../shared/snacki-map/snacki-map.component';

/** Nombres visibles de las categorías del backend (`TenantCategory`). */
const CATEGORIAS: Record<string, string> = {
  comida_rapida: 'Comida rápida',
  pizza: 'Pizza',
  cafe: 'Café',
  helado: 'Helados',
  otro: 'Otros',
};

interface Filtro { id: string; nombre: string; }

/** Si el cliente está a más de esto del comercio más cercano, el mapa se ajusta solo a los comercios. */
const RADIO_AJUSTE_M = 20_000;

/** Coordenadas del local si son válidas. */
export function puntoDe(local: Local): Punto | null {
  return esCoordenadaValida(local.latitud, local.longitud) ? { lat: local.latitud!, lng: local.longitud! } : null;
}

@Component({
  selector: 'app-explorar',
  templateUrl: './explorar.page.html',
  styleUrls: ['./explorar.page.scss'],
  imports: [IonContent, IonIcon, IonSearchbar, DecimalPipe, SnackiHeaderComponent, SnackiMapComponent, IconComponent],
})
export class ExplorarPage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);
  // App zoneless: los datos llegan por effects y promesas, así que hay que marcar la vista para repintar.
  private cdr = inject(ChangeDetectorRef);
  readonly ubicacion = inject(UbicacionService);

  locales: Local[] = [];
  resultados: Local[] = [];
  filtros: Filtro[] = [];
  categoria = 'todas';
  total = 0;
  usaWallet = false;
  /** Marcadores y encuadre del mapa: se recalculan solo al filtrar para que el mapa no recentre en cada render. */
  marcadores: MapaMarcador[] = [];
  ajusteMapa: Punto[] | null = null;
  seleccionado: Local | null = null;
  mostrarMapa = true;
  private distancias = new Map<string, number>();
  private busqueda = '';

  constructor() {
    addIcons({ cardOutline, giftOutline, locationOutline, pricetagOutline, storefrontOutline });
    effect(() => {
      this.stores.catalogoVersion();
      untracked(() => this.cargarDatos());
    });
    // Al conocer la posición del cliente se reordena por cercanía.
    effect(() => {
      this.ubicacion.posicion();
      untracked(() => this.aplicarFiltros());
    });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  ionViewWillEnter() {
    this.cargarDatos();
    void this.stores.refrescar(3000);
    void this.ubicacion.restaurarSiPermitida();
  }

  usarUbicacion() {
    void this.ubicacion.solicitar();
  }

  alternarMapa() {
    this.mostrarMapa = !this.mostrarMapa;
  }

  /** Distancia legible desde el cliente, o '' si no hay posición o coordenadas. */
  distancia(local: Local): string {
    const d = this.distancias.get(local.id);
    return d === undefined ? '' : formatearDistancia(d);
  }

  elegirMarcador(id: string) {
    this.seleccionado = this.resultados.find((l) => l.id === id) ?? null;
    this.actualizarMarcadores();
  }

  cerrarSeleccion() {
    this.seleccionado = null;
    this.actualizarMarcadores();
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
    const yo = this.ubicacion.posicion();
    this.distancias.clear();
    if (yo) {
      for (const l of this.locales) {
        const p = puntoDe(l);
        if (p) this.distancias.set(l.id, distanciaMetros(yo, p));
      }
    }
    const lejos = Number.POSITIVE_INFINITY;
    this.resultados = this.locales
      .filter((l) => this.categoria === 'todas' || l.categoria === this.categoria)
      .filter((l) => !this.busqueda || l.nombre.toLowerCase().includes(this.busqueda) || (l.direccion ?? '').toLowerCase().includes(this.busqueda))
      // Con ubicación: los más cercanos primero; sin ella, donde el cliente ya tiene puntos.
      .sort((a, b) => yo
        ? (this.distancias.get(a.id) ?? lejos) - (this.distancias.get(b.id) ?? lejos) || a.nombre.localeCompare(b.nombre)
        : b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));
    if (this.seleccionado && !this.resultados.some((l) => l.id === this.seleccionado!.id)) this.seleccionado = null;
    this.actualizarMarcadores();
    this.actualizarAjuste(yo);
    this.cdr.markForCheck();
  }

  private actualizarMarcadores() {
    this.marcadores = this.resultados.flatMap((l) => {
      const p = puntoDe(l);
      return p ? [{ id: l.id, ...p, etiqueta: l.nombre, activo: l.id === this.seleccionado?.id }] : [];
    });
  }

  /** Encuadra los comercios y, si está cerca, también al cliente. */
  private actualizarAjuste(yo: Punto | null) {
    const puntos: Punto[] = this.marcadores.map((m) => ({ lat: m.lat, lng: m.lng }));
    const masCercano = Math.min(...this.distancias.values());
    if (yo && (!puntos.length || masCercano <= RADIO_AJUSTE_M)) puntos.push(yo);
    this.ajusteMapa = puntos.length ? puntos : null;
  }
}
