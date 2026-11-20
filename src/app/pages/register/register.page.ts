import { Component, OnInit, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonCheckbox, IonContent, IonIcon, IonInput, IonSelect, IonSelectOption, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiResponse } from '../../models/auth.models';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { AuthService } from '../../services/auth.service';

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonCheckbox, IonIcon, IonSelect, IonSelectOption, FormsModule, SnackiHeaderComponent],
})
export class RegisterPage implements OnInit {
  private router = inject(Router);
  private toast = inject(ToastController);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);

  private returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';

  tipoCuenta: 'cliente' | 'comercio' = this.route.snapshot.queryParamMap.get('tipo') === 'comercio' ? 'comercio' : 'cliente';
  locales: TenantOption[] = [];
  cargandoLocales = false;

  form = {
    nombre: '',
    edad: null as number | null,
    password: '',
    confirmar: '',
    correo: '',
    cedula: '',
    acepta: false,
    comercioId: '',
  };

  verPassword = false;
  verConfirmar = false;
  enviando = false;

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });
  }

  ngOnInit() {
    void this.cargarLocales();
  }

  async cargarLocales() {
    this.cargandoLocales = true;
    try {
      const res = await firstValueFrom(
        this.http.get<ApiResponse<{ tenants: TenantOption[] }>>(`${environment.apiBaseUrl}/api/tenants`),
      );
      this.locales = (res.data?.tenants || []).filter((t) => t.slug !== 'snacki');
    } catch {
      this.locales = [];
    } finally {
      this.cargandoLocales = false;
    }
  }

  async registrar() {
    if (this.enviando) return;
    const f = this.form;
    let error = '';
    if (!f.nombre.trim() || !f.password || !f.correo.trim() || !f.cedula.trim() || (this.tipoCuenta === 'cliente' && f.edad === null) || (this.tipoCuenta === 'comercio' && !f.comercioId)) {
      error = 'Completa todos los campos.';
    } else if (this.tipoCuenta === 'cliente' && (!Number.isInteger(Number(f.edad)) || Number(f.edad) < 18)) {
      error = 'Debes tener 18 años o más para registrarte.';
    } else if (f.password.length < 8) {
      error = 'La contraseña debe tener al menos 8 caracteres.';
    } else if (f.password !== f.confirmar) {
      error = 'Las contraseñas no coinciden.';
    } else if (!f.acepta) {
      error = 'Debes aceptar los términos y condiciones.';
    }

    if (error) {
      await this.mostrarToast(error, 'danger');
      return;
    }

    this.enviando = true;
    try {
      const result = await this.auth.register(f.nombre, f.correo, f.password, this.tipoCuenta, f.comercioId || undefined);
      if (!result.success) {
        await this.mostrarToast(result.message || 'No se pudo crear la cuenta.', 'danger');
        return;
      }
      this.router.navigateByUrl(this.destinoSeguro());
    } finally {
      this.enviando = false;
    }
  }

  agregarFoto() {}

  private destinoSeguro(): string {
    if (!this.returnUrl.startsWith('/') || this.returnUrl.startsWith('//')) return this.homePorRol();
    return this.returnUrl;
  }

  private homePorRol(): string {
    return this.tipoCuenta === 'comercio' ? '/comercio' : '/tabs/home';
  }

  private async mostrarToast(message: string, color: 'danger' | 'success' | 'medium' = 'medium') {
    const t = await this.toast.create({ message, duration: 2200, color, position: 'bottom' });
    await t.present();
  }
}
