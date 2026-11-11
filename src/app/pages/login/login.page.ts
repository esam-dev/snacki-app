import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonInput, ToastController } from '@ionic/angular';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [IonContent, IonInput, IonButton, FormsModule],
})
export class LoginPage {
  private router = inject(Router);
  private toast = inject(ToastController);

  usuario = '';
  password = '';

  iniciarSesion() {
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
