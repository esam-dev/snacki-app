import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonCheckbox, IonContent, IonIcon, IonInput, IonSelect, IonSelectOption, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { eyeOffOutline, eyeOutline } from 'ionicons/icons';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';
import { AuthService } from '../../services/auth.service';
import { StoreService } from '../../services/store.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [IonContent, IonInput, IonButton, IonCheckbox, IonIcon, IonSelect, IonSelectOption, FormsModule, SnackiHeaderComponent],
})
export class RegisterPage {
  private router = inject(Router);
  private toast = inject(ToastController);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private stores = inject(StoreService);

  tipoCuenta: 'cliente' | 'comercio' = this.route.snapshot.queryParamMap.get('tipo') === 'comercio' ? 'comercio' : 'cliente';
  locales = this.stores.getAll();

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

  constructor() {
    addIcons({ eyeOutline, eyeOffOutline });
  }

  async registrar() {
    const f = this.form;
    let error = '';
    if (!f.nombre.trim() || !f.password || !f.correo.trim() || !f.cedula.trim() || (this.tipoCuenta === 'cliente' && f.edad === null) || (this.tipoCuenta === 'comercio' && !f.comercioId)) error = 'Completa todos los campos.';
    else if (this.tipoCuenta === 'cliente' && (!Number.isInteger(Number(f.edad)) || Number(f.edad) < 18)) error = 'Debes tener 18 años o más para registrarte.';
    else if (f.password !== f.confirmar) error = 'Las contraseñas no coinciden.';
    else if (!f.acepta) error = 'Debes aceptar los términos y condiciones.';

    if (error) {
      const t = await this.toast.create({ message: error, duration: 2200, color: 'danger' });
      await t.present();
      return;
    }
    this.auth.registrar(f.nombre, f.correo, this.tipoCuenta, f.comercioId || undefined);
    this.router.navigateByUrl(this.tipoCuenta === 'comercio' ? '/comercio' : '/tabs/home');
  }

  /** Pendiente: integrar @capacitor/camera para elegir/tomar la foto de perfil. */
  agregarFoto() {}
}
