import { ChangeDetectorRef, Component, effect, inject, untracked } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonInput, IonSpinner, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { copyOutline, giftOutline, shareSocialOutline } from 'ionicons/icons';
import { ReferidoComercio, ReferralsService } from '../../services/referrals.service';
import { SnackiHeaderComponent } from '../../shared/snacki-header/snacki-header.component';

const LOGO_POR_DEFECTO = 'assets/icon/icon-snacki.png';

/**
 * "Invita y gana": el código del cliente en cada comercio con referidos activos, cómo funciona el bono
 * y el estado de sus invitaciones. También permite usar el código de un amigo (requiere conexión).
 */
@Component({
  selector: 'app-referidos',
  templateUrl: './referidos.page.html',
  styleUrls: ['./referidos.page.scss'],
  imports: [IonContent, IonButton, IonIcon, IonInput, IonSpinner, FormsModule, DecimalPipe, DatePipe, SnackiHeaderComponent],
})
export class ReferidosPage {
  private referrals = inject(ReferralsService);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastController);
  // La app no usa zone.js: tras cada respuesta asíncrona hay que pedir que se repinte.
  private cdr = inject(ChangeDetectorRef);

  comercios: ReferidoComercio[] = [];
  /** Comercio desde el que se llegó (tienda), para mostrarlo primero. */
  destacado = this.route.snapshot.queryParamMap.get('local');
  cargando = false;
  sinConexion = false;
  actualizado: string | null = null;

  codigoAmigo = '';
  aplicando = false;

  readonly logoPorDefecto = LOGO_POR_DEFECTO;

  constructor() {
    addIcons({ copyOutline, giftOutline, shareSocialOutline });
    effect(() => {
      this.referrals.version();
      untracked(() => this.cargarDatos());
    });
  }

  ionViewWillEnter() {
    this.destacado = this.route.snapshot.queryParamMap.get('local');
    void this.refrescar();
  }

  async refrescar() {
    this.cargarDatos();
    this.cargando = !this.referrals.datos;
    const ok = await this.referrals.refrescar();
    this.sinConexion = !ok;
    this.cargando = false;
    this.cargarDatos();
  }

  /** Comercios donde llegué invitado y aún falta la primera compra: se muestran como recordatorio. */
  get invitacionesPendientes(): ReferidoComercio[] {
    return this.comercios.filter((c) => c.invitadoPor?.estado === 'PENDING');
  }

  async copiar(c: ReferidoComercio) {
    try {
      await navigator.clipboard.writeText(c.codigo);
      await this.mostrar(`Código ${c.codigo} copiado.`);
    } catch {
      await this.mostrar(`Tu código en ${c.nombre} es ${c.codigo}.`);
    }
  }

  async compartir(c: ReferidoComercio) {
    const texto = this.mensajeInvitacion(c);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'Invita y gana en Snacki', text: texto });
        return;
      } catch (e) {
        if ((e as DOMException)?.name === 'AbortError') return; // el usuario cerró el menú de compartir
      }
    }
    try {
      await navigator.clipboard.writeText(texto);
      await this.mostrar('Invitación copiada. Pégala en tu chat favorito.');
    } catch {
      await this.mostrar(texto);
    }
  }

  async aplicar() {
    if (this.aplicando || !this.codigoAmigo.trim()) return;
    this.aplicando = true;
    this.cdr.markForCheck();
    try {
      const r = await this.referrals.aplicar(this.codigoAmigo);
      if (r.ok) {
        this.codigoAmigo = '';
        this.destacado = r.comercioId || this.destacado;
        const bono = r.bonoInvitado > 0 ? ` Ganarás ${r.bonoInvitado.toLocaleString('es')} pts` : ' Tu amigo ganará su bono';
        await this.mostrar(`¡Listo! Te invitó ${r.invita} a ${r.comercio}.${bono} con tu primera compra con promo ahí.`);
      } else {
        await this.mostrar(r.mensaje);
      }
    } finally {
      this.aplicando = false;
      this.cdr.markForCheck();
    }
  }

  mensajeInvitacion(c: ReferidoComercio): string {
    const bono = c.bonoInvitado > 0 ? ` y gana ${c.bonoInvitado.toLocaleString('es')} pts` : '';
    return `Te invito a ${c.nombre} en Snacki: usa mi código ${c.codigo}${bono} con tu primera compra con promo.`;
  }

  private cargarDatos() {
    const datos = this.referrals.datos;
    this.actualizado = datos?.actualizado ?? null;
    const lista = [...(datos?.comercios ?? [])];
    // Primero el comercio desde el que se llegó; luego los que ya tienen invitaciones.
    lista.sort((a, b) =>
      Number(b.slug === this.destacado) - Number(a.slug === this.destacado)
      || (b.pendientes + b.completados) - (a.pendientes + a.completados)
      || a.nombre.localeCompare(b.nombre));
    this.comercios = lista;
    this.cdr.markForCheck();
  }

  private async mostrar(message: string) {
    const t = await this.toast.create({ message, duration: 3200, position: 'top' });
    await t.present();
  }
}
