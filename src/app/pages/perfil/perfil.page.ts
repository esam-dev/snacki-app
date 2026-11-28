import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { IonButton, IonCheckbox, IonContent, IonIcon, IonInput, NavController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline, giftOutline } from 'ionicons/icons';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonCheckbox, IonIcon, FormsModule, RouterLink, SnackiHeaderComponent],
})
export class PerfilPage {
  private auth = inject(AuthService);
  private nav = inject(NavController);

  nombre = this.auth.currentUser?.nombre ?? 'Usuario';
  correo = this.auth.currentUser?.correo ?? '';
  cedula = '1234599';
  nacimiento = '2000-01-01';
  notificaciones = false;
  verCedula = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline, giftOutline });
  }

  get cedulaMostrada(): string {
    if (this.verCedula) return this.cedula;
    return '*****' + this.cedula.slice(-2);
  }

  agregarFoto() {}

  async cerrarSesion() {
    await this.auth.cerrarSesion();
    // navigateRoot vacía la pila de Ionic (tabs incluidas) y deja el login como única pantalla.
    await this.nav.navigateRoot('/login', { replaceUrl: true });
  }
}
