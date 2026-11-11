import { Component, OnInit, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline } from 'ionicons/icons';
import { Local, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { InicioBarComponent } from '../../shared/inicio-bar/inicio-bar.component';

export interface Canje {
  local: string;
  descripcion: string;
  puntos: number;
  fecha: string;
}

@Component({
  selector: 'app-puntos',
  templateUrl: './puntos.page.html',
  styleUrls: ['./puntos.page.scss'],
  imports: [IonContent, IonIcon, DecimalPipe, DatePipe, SnackiHeaderComponent, InicioBarComponent],
})
export class PuntosPage implements OnInit {
  private stores = inject(StoreService);

  locales: Local[] = this.stores.getAll();
  total = this.stores.totalPuntos;
  /** Historial de canjes (vacío por ahora, igual que en el diseño). */
  canjes: Canje[] = [];

  constructor() {
    addIcons({ cardOutline });
  }

  ngOnInit() {
    this.cargarDatos();
  }

  ionViewWillEnter() {
    this.cargarDatos();
  }

  private cargarDatos() {
    this.locales = this.stores.getAll();
    this.total = this.stores.totalPuntos;
  }
}
