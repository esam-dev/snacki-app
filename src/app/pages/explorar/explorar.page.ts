import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cardOutline } from 'ionicons/icons';
import { Local, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { InicioBarComponent } from '../../shared/inicio-bar/inicio-bar.component';

@Component({
  selector: 'app-explorar',
  templateUrl: './explorar.page.html',
  styleUrls: ['./explorar.page.scss'],
  imports: [IonContent, IonIcon, DecimalPipe, SnackiHeaderComponent, InicioBarComponent],
})
export class ExplorarPage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);

  locales: Local[] = this.stores.getAll();
  total = this.stores.totalPuntos;

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

  abrir(local: Local) {
    this.router.navigate(['/tabs/explorar', local.id]);
  }
}
