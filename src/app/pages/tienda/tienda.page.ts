import { Component, OnInit, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';
import { Local, StoreService } from '../../services/store.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { InicioBarComponent } from '../../shared/inicio-bar/inicio-bar.component';

@Component({
  selector: 'app-tienda',
  templateUrl: './tienda.page.html',
  styleUrls: ['./tienda.page.scss'],
  imports: [IonContent, IonButton, DecimalPipe, SnackiHeaderComponent, InicioBarComponent],
})
export class TiendaPage implements OnInit {
  private route = inject(ActivatedRoute);
  private stores = inject(StoreService);
  private router = inject(Router);

  local?: Local = this.stores.getById(this.route.snapshot.paramMap.get('id'));

  ngOnInit() {
    this.cargarLocal();
  }

  ionViewWillEnter() {
    this.cargarLocal();
  }

  private cargarLocal() {
    this.local = this.stores.getById(this.route.snapshot.paramMap.get('id'));
    if (!this.local) this.router.navigateByUrl('/tabs/explorar');
  }

  mostrarQr() {
    this.router.navigateByUrl('/tabs/qr');
  }
}
