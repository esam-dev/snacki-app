import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, lockClosedOutline, personOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonIcon, FormsModule],
})
export class LoginPage {
  private router = inject(Router);
  private toast = inject(ToastController);

  usuario = '';
  password = '';
  verPassword = false;

  constructor() {
    addIcons({ personOutline, lockClosedOutline, eyeOutline, eyeOffOutline });
  }

  async iniciarSesion() {
    if (!this.usuario.trim() || !this.password) {
      const t = await this.toast.create({
        message: 'Completa tu usuario y contraseña para continuar.',
        duration: 2200,
        color: 'danger',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    // TODO: reemplazar por autenticación real contra el backend.
    this.router.navigateByUrl('/tabs/explorar');
  }

  async olvideContrasena() {
    const t = await this.toast.create({
      message: 'Función de recuperación de contraseña próximamente.',
      duration: 2000,
      position: 'bottom',
    });
    await t.present();
  }

  registrarse() {
    this.router.navigateByUrl('/register');
  }
}
