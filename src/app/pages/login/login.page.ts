import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
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
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);
  private auth = inject(AuthService);

  private returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';

  usuario = '';
  password = '';
  tipoCuenta: TipoCuenta = 'cliente';
  verPassword = false;
  cargando = false;

  constructor() {
    addIcons({ personOutline, lockClosedOutline, eyeOutline, eyeOffOutline, storefrontOutline });
  }

  ngOnInit() {
    void this.verificarSesion();
  }

  private async verificarSesion() {
    await this.auth.ensureSessionResolved();
    if (this.auth.currentUser) {
      this.router.navigateByUrl(this.homePorRol());
    }
  }

  async iniciarSesion() {
    if (this.cargando) return;

    if (!this.usuario.trim() || !this.password.trim()) {
      await this.mostrarToast('Completa tu usuario/correo y contraseña', 'danger');
      return;
    }

    this.cargando = true;
    try {
      const result = await this.auth.login(this.usuario, this.password, this.tipoCuenta);
      if (!result.success) {
        await this.mostrarToast(result.message || 'Credenciales o tipo de cuenta incorrectos.', 'danger');
        return;
      }
      this.irAlInicio();
    } finally {
      this.cargando = false;
    }
  }

  async olvideContrasena() {
    await this.mostrarToast('Función de recuperación de contraseña próximamente.', 'medium');
  }

  registrarse() {
    this.router.navigate(['/register'], {
      queryParams: {
        tipo: this.tipoCuenta,
        ...(this.returnUrl ? { returnUrl: this.returnUrl } : {}),
      },
    });
  }

  private irAlInicio() {
    this.router.navigateByUrl(this.destinoSeguro());
  }

  private destinoSeguro(): string {
    if (!this.returnUrl.startsWith('/') || this.returnUrl.startsWith('//')) return this.homePorRol();
    return this.returnUrl;
  }

  private homePorRol(): string {
    return this.auth.currentUser?.tipo === 'comercio' ? '/comercio' : '/tabs/home';
  }

  private async mostrarToast(message: string, color: 'danger' | 'medium' | 'success' = 'medium') {
    const t = await this.toast.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }
}
