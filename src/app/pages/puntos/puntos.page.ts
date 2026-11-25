import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline } from 'ionicons/icons';
import { Local, MovimientoPuntos, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { InicioBarComponent } from '../../shared/inicio-bar/inicio-bar.component';

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
  movimientos: MovimientoPuntos[] = this.stores.movimientos;

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
    void this.stores.refrescarCatalogo(3000);
  }

  private cargarDatos() {
    this.locales = this.stores.getAll();
    this.total = this.stores.totalPuntos;
    this.movimientos = this.stores.movimientos;
  }
}
