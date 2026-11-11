import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { menuOutline, searchOutline } from 'ionicons/icons';

@Component({
  selector: 'app-inicio-bar',
  templateUrl: './inicio-bar.component.html',
  styleUrls: ['./inicio-bar.component.scss'],
  imports: [IonIcon],
})
export class InicioBarComponent {
  private router = inject(Router);

  constructor() {
    addIcons({ menuOutline, searchOutline });
  }

  irABuscar() {
    this.router.navigateByUrl('/tabs/buscar');
  }
}
