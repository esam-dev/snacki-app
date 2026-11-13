import { Component, Input, inject } from '@angular/core';
import { IonIcon, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronBackOutline } from 'ionicons/icons';

@Component({
  selector: 'app-snacki-header',
  templateUrl: './snacki-header.component.html',
  styleUrls: ['./snacki-header.component.scss'],
  imports: [IonIcon],
})
export class SnackiHeaderComponent {
  private nav = inject(NavController);

  /** Muestra el botón circular azul de "volver". */
  @Input() back = false;

  constructor() {
    addIcons({ chevronBackOutline });
  }

  goBack() {
    this.nav.back();
  }
}
