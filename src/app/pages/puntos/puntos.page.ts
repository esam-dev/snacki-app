import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline } from 'ionicons/icons';
import { Local, MovimientoPuntos, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

/** Se avisa que los puntos están por vencer cuando faltan estos días o menos. */
const AVISO_VENCIMIENTO_DIAS = 7;

@Component({
  selector: 'app-puntos',
  templateUrl: './puntos.page.html',
  styleUrls: ['./puntos.page.scss'],
  imports: [IonContent, IonIcon, DecimalPipe, DatePipe, SnackiHeaderComponent],
})
export class PuntosPage implements OnInit {
  private stores = inject(StoreService);

  locales: Local[] = [];
  total = 0;
  movimientos: MovimientoPuntos[] = [];
  usaWallet = false;
  actualizado: string | null = null;

  constructor() {
    addIcons({ cardOutline });
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

  /** Ancho de la barra de progreso (0–100). */
  progreso(local: Local): number {
    const p = local.siguienteRecompensa?.progreso ?? (local.canjeables ? 1 : 0);
    return Math.max(0, Math.min(100, Math.round(p * 100)));
  }

  vencePronto(local: Local): boolean {
    if (!local.vencimiento || !local.puntos) return false;
    const dias = (new Date(local.vencimiento).getTime() - Date.now()) / 86_400_000;
    return dias <= AVISO_VENCIMIENTO_DIAS;
  }

  private cargarDatos() {
    this.usaWallet = this.stores.usaWallet;
    this.actualizado = this.stores.walletActualizada;
    // Primero los comercios donde el cliente tiene puntos.
    this.locales = this.stores.getAll().sort((a, b) => b.puntos - a.puntos || a.nombre.localeCompare(b.nombre));
    this.total = this.stores.totalPuntos;
    this.movimientos = this.stores.movimientos;
  }
}
