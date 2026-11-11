import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonCheckbox, IonContent, IonIcon, IonInput, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonCheckbox, IonIcon, FormsModule, SnackiHeaderComponent],
})
export class RegisterPage {
  private router = inject(Router);
  private toast = inject(ToastController);

  form = {
    nombre: '',
    password: '',
    confirmar: '',
    correo: '',
    cedula: '',
    acepta: false,
  };

  verPassword = false;
  verConfirmar = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });
  }

  async registrar() {
    const f = this.form;
    let error = '';
    if (!f.nombre || !f.password || !f.correo || !f.cedula) error = 'Completa todos los campos.';
    else if (f.password !== f.confirmar) error = 'Las contraseñas no coinciden.';
    else if (!f.acepta) error = 'Debes aceptar los términos y condiciones.';

    if (error) {
      const t = await this.toast.create({ message: error, duration: 2200, color: 'danger' });
      await t.present();
      return;
    }
    // TODO: enviar al backend.
    this.router.navigateByUrl('/tabs/explorar');
  }

  /** Pendiente: integrar @capacitor/camera para elegir/tomar la foto de perfil. */
  agregarFoto() {}
}
