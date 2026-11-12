import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, lockClosedOutline, personOutline } from 'ionicons/icons';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonIcon, FormsModule],
})
export class LoginPage implements OnInit {
  private router = inject(Router);
  private toast = inject(ToastController);
  private auth = inject(AuthService);

  usuario = '';
  password = '';
  verPassword = false;
  cargando = false;

  constructor() {
    addIcons({ personOutline, lockClosedOutline, eyeOutline, eyeOffOutline });
  }

  ngOnInit() {
    if (this.auth.currentUser) this.router.navigateByUrl('/tabs/home');
  }

  async iniciarSesion() {
    if (this.cargando) return;

    if (!this.auth.iniciarSesion(this.usuario, this.password)) {
      const t = await this.toast.create({
        message: 'Completa tu usuario y contraseña para continuar.',
        duration: 2200,
        color: 'danger',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    this.cargando = true;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    this.router.navigateByUrl('/tabs/home');
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
