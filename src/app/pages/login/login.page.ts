import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, NavController, ToastController } from '@ionic/angular';
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
  private nav = inject(NavController);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);
  private auth = inject(AuthService);

  usuario = '';
  password = '';
  tipoCuenta: TipoCuenta = 'cliente';
  verPassword = false;
  /**
   * Signal a propósito: la app no usa zone.js, y un campo normal que cambia después de un `await`
   * no garantiza que la vista se repinte (el overlay de carga podía quedarse tapando el login).
   */
  readonly cargando = signal(false);

  /** Se lee en cada uso: Ionic puede reutilizar esta página y la ruta cambia entre visitas. */
  private get returnUrl(): string { return this.route.snapshot.queryParamMap.get('returnUrl') ?? ''; }

  constructor() { addIcons({ personOutline, lockClosedOutline, eyeOutline, eyeOffOutline, storefrontOutline }); }
  ngOnInit() { void this.verificarSesion(); }

  private async verificarSesion() {
    await this.auth.ensureSessionResolved();
    if (this.auth.currentUser) await this.nav.navigateRoot(this.homePorRol(), { replaceUrl: true });
  }

  async iniciarSesion() {
    if (this.cargando()) return;
    if (!this.usuario.trim() || !this.password.trim()) return this.mostrarToast('Completa tu usuario/correo y contraseña', 'danger');

    this.cargando.set(true);
    let error: string | null = null;
    try {
      const result = await this.auth.login(this.usuario, this.password, this.tipoCuenta);
      if (result.success) {
        // navigateRoot saca el login de la pila: el botón "atrás" no vuelve a él con la sesión abierta.
        await this.nav.navigateRoot(this.destinoSeguro(), { replaceUrl: true });
      } else {
        error = result.message || 'Credenciales o tipo de cuenta incorrectos.';
      }
    } catch {
      error = 'No se pudo iniciar sesión. Inténtalo de nuevo.';
    } finally {
      // Pase lo que pase (fallo, timeout o excepción) se quita el overlay y se vuelve al formulario.
      this.cargando.set(false);
    }
    if (error) await this.mostrarToast(error, 'danger');
  }

  async olvideContrasena() { await this.mostrarToast('Función de recuperación de contraseña próximamente.', 'medium'); }
  registrarse() { this.router.navigate(['/register'], { queryParams: { tipo: this.tipoCuenta, ...(this.returnUrl ? { returnUrl: this.returnUrl } : {}) } }); }

  private destinoSeguro(): string {
    return this.returnUrl.startsWith('/') && !this.returnUrl.startsWith('//') ? this.returnUrl : this.homePorRol();
  }
  private homePorRol(): string { return this.auth.currentUser?.tipo === 'comercio' ? '/comercio' : '/tabs/home'; }
  private async mostrarToast(message: string, color: 'danger' | 'medium' | 'success' = 'medium') {
    const t = await this.toast.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }
}