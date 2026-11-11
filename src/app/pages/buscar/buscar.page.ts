import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSearchbar } from '@ionic/angular';
import { Local, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

@Component({
  selector: 'app-buscar',
  templateUrl: './buscar.page.html',
  styleUrls: ['./buscar.page.scss'],
  imports: [IonContent, IonSearchbar, SnackiHeaderComponent],
})
export class BuscarPage implements OnInit {
  private stores = inject(StoreService);
  private router = inject(Router);

  resultados: Local[] = this.stores.getAll();

  ngOnInit() {
    this.resultados = this.stores.getAll();
  }

  ionViewWillEnter() {
    this.resultados = this.stores.getAll();
  }

  filtrar(ev: Event) {
    const texto = (ev as CustomEvent).detail?.value ?? '';
    this.resultados = this.stores.buscar(texto);
  }

  abrir(local: Local) {
    this.router.navigate(['/tabs/explorar', local.id]);
  }
}
