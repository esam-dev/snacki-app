import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline, lockClosedOutline, personOutline, storefrontOutline } from 'ionicons/icons';
import { AuthService, TipoCuenta } from '../../services/auth.service';

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
  tipoCuenta: TipoCuenta = 'cliente';
  verPassword = false;
  cargando = false;

  constructor() {
    addIcons({ personOutline, lockClosedOutline, eyeOutline, eyeOffOutline, storefrontOutline });
  }

  ngOnInit() {
    if (this.auth.currentUser) this.irAlInicio();
  }

  async iniciarSesion() {
    if (this.cargando) return;

    if (!this.auth.iniciarSesion(this.usuario, this.password, this.tipoCuenta)) {
      const t = await this.toast.create({
        message: this.usuario.trim() && this.password.trim()
          ? 'Revisa el tipo de cuenta o regístrate como comercio si aún no tienes un perfil comercial.'
          : 'Completa tu usuario y contraseña para continuar.',
        duration: 2200,
        color: 'danger',
        position: 'bottom',
      });
      await t.present();
      return;
    }
    this.cargando = true;
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    this.irAlInicio();
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
    this.router.navigate(['/register'], { queryParams: { tipo: this.tipoCuenta } });
  }

  private irAlInicio() {
    this.router.navigateByUrl(this.auth.currentUser?.tipo === 'comercio' ? '/comercio' : '/tabs/home');
  }
}
