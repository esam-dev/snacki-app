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
    // Si ya hay sesión, volvemos a la home del rol: reutilizar un returnUrl aquí
    // podría generar un bucle con el guard cuando el rol no coincide.
    if (this.auth.currentUser) this.router.navigateByUrl(this.homePorRol());
  }

  async iniciarSesion() {
    if (this.cargando) return;

    if (!this.auth.iniciarSesion(this.usuario, this.password, this.tipoCuenta)) {
      const mensaje = !this.usuario.trim() || !this.password.trim()
        ? 'Completa tu usuario y contraseña'
        : 'Credenciales o tipo de cuenta incorrectos. Revisa el tipo seleccionado e inténtalo de nuevo.';
      const t = await this.toast.create({
        message: mensaje,
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
    // Evitamos open redirect: solo rutas internas absolutas de un solo slash.
    if (!this.returnUrl.startsWith('/') || this.returnUrl.startsWith('//')) return this.homePorRol();
    return this.returnUrl;
  }

  private homePorRol(): string {
    return this.auth.currentUser?.tipo === 'comercio' ? '/comercio' : '/tabs/home';
  }
}
