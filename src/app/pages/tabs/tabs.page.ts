import { Component, DestroyRef, inject } from '@angular/core';
import { IonIcon, IonLabel, IonTabBar, IonTabButton, IonTabs } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { compassOutline, homeOutline, infinite, personCircle, starOutline } from 'ionicons/icons';
import { StoreService } from '../../services/store.service';

/** Cada cuánto se consulta si los comercios cambiaron sus promos o recompensas mientras la app está abierta. */
const CATALOGO_REFRESCO_MS = 60_000;

@Component({
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
})
export class TabsPage {
  private stores = inject(StoreService);

  constructor() {
    addIcons({ homeOutline, compassOutline, infinite, starOutline, personCircle });

    // Los cambios del comercio (promos, recompensas, logo, vencimiento) llegan al cliente:
    // al entrar, al volver a la app y de forma periódica mientras está abierta.
    void this.stores.refrescarCatalogo();
    const alVolver = () => {
      if (document.visibilityState === 'visible') void this.stores.refrescarCatalogo(5000);
    };
    document.addEventListener('visibilitychange', alVolver);
    const timer = window.setInterval(alVolver, CATALOGO_REFRESCO_MS);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', alVolver);
      window.clearInterval(timer);
    });
  }
}
