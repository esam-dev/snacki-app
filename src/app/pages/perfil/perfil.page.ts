import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCheckbox, IonContent, IonIcon, IonInput } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOutline, eyeOffOutline } from 'ionicons/icons';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { AuthService } from '../../services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-perfil',
  templateUrl: './perfil.page.html',
  styleUrls: ['./perfil.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonCheckbox, IonIcon, FormsModule, SnackiHeaderComponent],
})
export class PerfilPage {
  private auth = inject(AuthService);
  private router = inject(Router);

  // Datos de ejemplo del diseño
  nombre = this.auth.currentUser?.nombre ?? 'Usuario';
  correo = this.auth.currentUser?.correo ?? '';
  cedula = '1234599';
  nacimiento = '2000-01-01';
  notificaciones = false;
  verCedula = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });
  }

  get cedulaMostrada(): string {
    if (this.verCedula) return this.cedula;
    return '*****' + this.cedula.slice(-2);
  }

  agregarFoto() {}

  cerrarSesion() {
    this.auth.cerrarSesion();
    this.router.navigateByUrl('/login');
  }
}
