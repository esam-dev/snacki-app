import { Component, OnInit, effect, inject, untracked } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline } from 'ionicons/icons';
import { Local, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

@Component({
  selector: 'app-explorar',
  templateUrl: './explorar.page.html',
  styleUrls: ['./explorar.page.scss'],
  imports: [IonContent, IonIcon, DecimalPipe, SnackiHeaderComponent],
})
export class ExplorarPage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);

  locales: Local[] = this.stores.getAll();
  total = this.stores.totalPuntos;

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
  }

  abrir(local: Local) {
    this.router.navigate(['/tabs/explorar', local.id]);
  }
}
