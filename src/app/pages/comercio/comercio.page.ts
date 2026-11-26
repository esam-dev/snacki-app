import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AlertController, IonButtons, IonContent, IonFooter, IonHeader, IonModal, IonSpinner, IonTitle, IonToolbar, NavController, ToastController } from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { MerchantProduct, MerchantQr, MerchantQrStatus, MerchantReward, MerchantService, MerchantSettings } from '../../services/merchant.service';
import QRCode from 'qrcode';
import { addIcons } from 'ionicons';
import { alertCircle, checkmarkCircle, close, informationCircle } from 'ionicons/icons';
import { playSuccessChime } from '../../shared/sound/success-chime';

type Aviso = 'ok' | 'error' | 'info';

type ModalKind = 'promo' | 'reward' | 'settings' | 'map' | 'qr' | null;

/** Unidades máximas por QR (igual que el backend). */
const QR_MAX_CANTIDAD = 20;
/** Cada cuánto se consulta si el cliente ya escaneó el QR mostrado. */
const QR_POLL_MS = 4000;
/** Logo de Snacki al centro del QR (corrección de errores H tolera ~30 % de área tapada; usamos ~5 %). */
const QR_LOGO_SRC = 'assets/icon/qr-logo.png';
const QR_SIZE = 640;
const QR_LOGO_RATIO = 0.2;
type Section = 'inicio' | 'promos' | 'recompensas';
type PromoStatus = 'activa' | 'programada' | 'finalizada' | 'pausada';

interface SetupTask {
  label: string;
  done: boolean;
  action: () => void;
}

/** Tipos de imagen que acepta el selector de fotos de promos y recompensas. */
const FOTO_TIPOS = ['image/png', 'image/jpeg', 'image/webp'];
/** Las fotos de celular pesan varios MB; se reducen antes de enviarlas, así que el tope de entrada es amplio. */
const FOTO_MAX_BYTES = 15 * 1024 * 1024;
/** El backend rechaza imágenes de más de 1 000 000 de caracteres (ver imageRefSchema). */
const IMAGEN_MAX_CHARS = 900_000;

type FotoDestino = 'promo' | 'reward';

export const CATEGORIAS = [
  { value: 'comida_rapida', label: 'Comida rápida' },
  { value: 'pizza', label: 'Pizza' },
  { value: 'helado', label: 'Heladería' },
  { value: 'cafe', label: 'Cafetería' },
  { value: 'otro', label: 'Otro' },
];

@Component({
  selector: 'app-comercio',
  templateUrl: './comercio.page.html',
  styleUrls: ['./comercio.page.scss'],
  imports: [IonContent, IonFooter, IonHeader, IonToolbar, IonTitle, IonButtons, IonModal, IonSpinner, FormsModule, DecimalPipe, DatePipe, NgTemplateOutlet, IconComponent],
})
export class ComercioPage {
  private auth = inject(AuthService);
  private merchant = inject(MerchantService);
  private nav = inject(NavController);
  private toast = inject(ToastController);
  private alert = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);
  private sanitizer = inject(DomSanitizer);

  constructor() {
    addIcons({ alertCircle, checkmarkCircle, close, informationCircle });
  }

  /** URL del mapa embebido; se calcula al abrir el modal para no recrear el iframe en cada ciclo. */
  mapEmbedUrl: SafeResourceUrl | null = null;
  /** Vista previa del mapa dentro del modal de configuración. */
  settingsMapUrl: SafeResourceUrl | null = null;
  private abrirSettingsTrasMapa = false;

  readonly categorias = CATEGORIAS;

  rewards: MerchantReward[] = [];
  products: MerchantProduct[] = [];
  settings?: MerchantSettings;
  loading = false;

  section: Section = 'inicio';
  modal: ModalKind = null;
  saving = false;

  // promo form
  editingPromoId: string | null = null;
  nombrePromo = '';
  descripcionPromo = '';
  puntosPromo: number | string | null = null;
  promoStartsAt = '';
  promoEndsAt = '';
  promoActiva = true;
  imagenPromo = '';
  procesandoImagenPromo = false;

  // reward form
  editingRewardId: string | null = null;
  nombreRecompensa = '';
  descripcionRecompensa = '';
  costoPuntos: number | string | null = null;
  imagenRecompensa = '';
  procesandoImagenRecompensa = false;

  // settings form
  settingsName = '';
  settingsCategory = 'otro';
  settingsAddress = '';
  settingsLat: number | string | null = null;
  settingsLng: number | string | null = null;
  settingsLogoUrl = '';
  settingsPointsExpireAt = '';
  procesandoLogo = false;

  // QR de compra
  readonly qrMaxCantidad = QR_MAX_CANTIDAD;
  qrProductId = '';
  qrCantidad = 1;
  qrResult: MerchantQr | null = null;
  qrImage = '';
  qrStatus: MerchantQrStatus = 'pending';
  qrRestante = '';
  generandoQr = false;
  anulandoQr = false;
  qrAnulado = false;
  /** `venta`: el cliente suma puntos. `canje`: el cliente gasta puntos en una recompensa. */
  qrTipo: 'venta' | 'canje' = 'venta';
  private qrRewardId = '';
  /** Al canjearse: a quién entregar la recompensa y el código del canje. */
  qrCliente: string | null = null;
  qrCodigo: string | null = null;
  private qrTimer: ReturnType<typeof setInterval> | null = null;

  get promosParaQr(): MerchantProduct[] {
    return this.products.filter((p) => this.promoStatus(p) === 'activa');
  }

  get qrProducto(): MerchantProduct | undefined {
    return this.products.find((p) => p.id === this.qrProductId);
  }

  get qrPuntosTotales(): number {
    return (this.qrProducto?.points ?? 0) * this.qrCantidad;
  }

  get comercioNombre(): string {
    return this.settings?.name || this.auth.currentUser?.tenantName || this.auth.currentUser?.nombre || 'Comercio';
  }

  get iniciales(): string {
    return this.comercioNombre
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('');
  }

  get categoriaLabel(): string {
    return this.categorias.find((c) => c.value === this.settings?.category)?.label || 'Sin categoría';
  }

  get promosActivas(): number {
    return this.products.filter((p) => this.promoStatus(p) === 'activa').length;
  }

  get promosProgramadas(): number {
    return this.products.filter((p) => this.promoStatus(p) === 'programada').length;
  }

  get recompensasActivas(): number {
    return this.rewards.filter((r) => r.isActive).length;
  }

  get costoPromedio(): number {
    if (!this.rewards.length) return 0;
    return Math.round(this.rewards.reduce((acc, r) => acc + r.cost, 0) / this.rewards.length);
  }

  get diasParaExpirar(): number | null {
    if (!this.settings?.pointsExpireAt) return null;
    const diff = new Date(this.settings.pointsExpireAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86_400_000));
  }

  get tieneUbicacion(): boolean {
    return this.settings?.latitude != null && this.settings?.longitude != null;
  }

  get setupTasks(): SetupTask[] {
    return [
      { label: 'Sube el logo de tu tienda', done: !!this.settings?.logoUrl, action: () => this.abrirSettings() },
      { label: 'Agrega la dirección', done: !!this.settings?.address, action: () => this.abrirSettings() },
      { label: 'Fija la ubicación en el mapa', done: this.tieneUbicacion, action: () => this.abrirSettings() },
      { label: 'Publica tu primera promo', done: this.products.length > 0, action: () => this.abrirPromo() },
      { label: 'Crea una recompensa', done: this.rewards.length > 0, action: () => this.abrirRecompensa() },
    ];
  }

  get setupProgress(): number {
    const tasks = this.setupTasks;
    return Math.round((tasks.filter((t) => t.done).length / tasks.length) * 100);
  }

  get promosVisibles(): MerchantProduct[] {
    return this.section === 'inicio' ? this.products.slice(0, 4) : this.products;
  }

  get recompensasVisibles(): MerchantReward[] {
    return this.section === 'inicio' ? this.rewards.slice(0, 4) : this.rewards;
  }

  promoStatus(p: MerchantProduct): PromoStatus {
    if (!p.isActive) return 'pausada';
    const now = Date.now();
    if (new Date(p.promoStartsAt).getTime() > now) return 'programada';
    if (new Date(p.promoEndsAt).getTime() < now) return 'finalizada';
    return 'activa';
  }

  async ionViewWillEnter() {
    await this.loadAll();
  }

  async loadAll() {
    this.loading = true;
    try {
      const [rewards, products, settings] = await Promise.all([
        this.merchant.listRewards(),
        this.merchant.listProducts(),
        this.merchant.getSettings(),
      ]);
      this.rewards = rewards;
      this.products = products;
      this.settings = settings;
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudieron cargar datos del comercio.');
    } finally {
      this.loading = false;
      this.cdr.markForCheck();
    }
  }

  setSection(s: Section) {
    this.section = s;
  }

  abrirPromo(p?: MerchantProduct) {
    this.editingPromoId = p?.id ?? null;
    this.nombrePromo = p?.name ?? '';
    this.descripcionPromo = p?.description ?? '';
    this.puntosPromo = p?.points ?? null;
    this.promoStartsAt = p ? this.toLocalInput(p.promoStartsAt) : '';
    this.promoEndsAt = p ? this.toLocalInput(p.promoEndsAt) : '';
    this.promoActiva = p?.isActive ?? true;
    this.imagenPromo = p?.imageUrl ?? '';
    this.procesandoImagenPromo = false;
    this.modal = 'promo';
  }

  abrirRecompensa(r?: MerchantReward) {
    this.editingRewardId = r?.id ?? null;
    this.nombreRecompensa = r?.name ?? '';
    this.descripcionRecompensa = r?.description ?? '';
    this.costoPuntos = r?.cost ?? null;
    this.imagenRecompensa = r?.imageUrl ?? '';
    this.procesandoImagenRecompensa = false;
    this.modal = 'reward';
  }

  abrirSettings() {
    const s = this.settings;
    this.settingsName = s?.name || '';
    this.settingsCategory = s?.category || 'otro';
    this.settingsAddress = s?.address || '';
    this.settingsLat = s?.latitude ?? null;
    this.settingsLng = s?.longitude ?? null;
    this.settingsLogoUrl = s?.logoUrl || '';
    this.settingsPointsExpireAt = s?.pointsExpireAt ? s.pointsExpireAt.slice(0, 10) : '';
    this.actualizarMapaSettings();
    this.modal = 'settings';
  }

  abrirMapa() {
    if (!this.tieneUbicacion) {
      this.abrirSettings();
      this.mostrar('Agrega la ubicación de tu tienda para verla en el mapa.', 'info');
      return;
    }
    const lat = Number(this.settings!.latitude);
    const lng = Number(this.settings!.longitude);
    this.mapEmbedUrl = this.buildMapUrl(lat, lng);
    this.modal = 'map';
  }

  /** Recalcula la vista previa del mapa del modal de configuración con las coordenadas del formulario. */
  actualizarMapaSettings() {
    const lat = this.settingsLat === '' || this.settingsLat === null ? NaN : Number(this.settingsLat);
    const lng = this.settingsLng === '' || this.settingsLng === null ? NaN : Number(this.settingsLng);
    const valido = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
    this.settingsMapUrl = valido ? this.buildMapUrl(lat, lng) : null;
  }

  private buildMapUrl(lat: number, lng: number): SafeResourceUrl {
    const d = 0.004;
    const url =
      `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d},${lat - d},${lng + d},${lat + d}` +
      `&layer=mapnik&marker=${lat},${lng}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  get googleMapsUrl(): string {
    return `https://www.google.com/maps/search/?api=1&query=${this.settings?.latitude},${this.settings?.longitude}`;
  }

  editarUbicacion() {
    // Se abre la configuración cuando el modal del mapa termina de cerrarse (ver onModalDismiss).
    this.abrirSettingsTrasMapa = true;
    this.modal = null;
  }

  // ---------- QR de compra ----------

  /** Abre el generador de QR; si viene una promo, queda preseleccionada. */
  abrirQr(p?: MerchantProduct) {
    const activas = this.promosParaQr;
    if (!activas.length) {
      this.mostrar('Necesitas una promo activa (vigente y sin pausar) para generar un QR.', 'info');
      return;
    }
    const elegida = p && activas.some((a) => a.id === p.id) ? p : activas[0];
    this.qrTipo = 'venta';
    this.qrProductId = elegida.id;
    this.qrCantidad = 1;
    this.limpiarQr();
    this.modal = 'qr';
  }

  /** QR de canje: el cliente lo escanea en el local y recién ahí se descuentan sus puntos. */
  async abrirQrCanje(r: MerchantReward) {
    if (!r.isActive) {
      await this.mostrar('Activa la recompensa para generar su QR de canje.', 'info');
      return;
    }
    this.qrTipo = 'canje';
    this.qrRewardId = r.id;
    this.limpiarQr();
    this.modal = 'qr';
    await this.generarQrCanje();
  }

  private async generarQrCanje() {
    if (this.generandoQr || !this.qrRewardId) return;
    this.generandoQr = true;
    this.cdr.markForCheck();
    try {
      await this.mostrarQrGenerado(await this.merchant.createRedeemQr(this.qrRewardId));
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo generar el QR de canje.');
      if (e?.status === 409) await this.loadAll();
      this.cerrarModal();
    } finally {
      this.generandoQr = false;
      this.cdr.markForCheck();
    }
  }

  private async mostrarQrGenerado(qr: MerchantQr) {
    this.qrImage = await this.dibujarQrConLogo(qr.qrContent);
    this.qrResult = qr;
    this.qrStatus = 'pending';
    this.actualizarRestante();
    this.iniciarSeguimientoQr();
    playSuccessChime();
  }

  cambiarCantidadQr(delta: number) {
    this.qrCantidad = Math.min(QR_MAX_CANTIDAD, Math.max(1, this.qrCantidad + delta));
  }

  async generarQr() {
    if (this.generandoQr || !this.qrProductId) return;
    this.generandoQr = true;
    this.cdr.markForCheck();
    try {
      await this.mostrarQrGenerado(await this.merchant.createQr(this.qrProductId, this.qrCantidad));
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo generar el QR.');
      // La promo pudo cambiar de estado (pausada / terminada): refresca la lista.
      if (e?.status === 409) await this.loadAll();
    } finally {
      this.generandoQr = false;
      this.cdr.markForCheck();
    }
  }

  /** Vuelve al formulario para emitir otro QR (la venta anterior sigue válida si no se escaneó). */
  nuevoQr() {
    this.limpiarQr();
    if (this.qrTipo === 'canje') void this.generarQrCanje();
  }

  /** Invalida el QR mostrado (venta cancelada o generado por error) para que nadie pueda usarlo. */
  async anularQr() {
    const claimId = this.qrResult?.claimId;
    if (!claimId || this.anulandoQr || this.qrStatus !== 'pending') return;
    const canje = this.qrTipo === 'canje';
    const ok = await this.confirmar(
      'Anular QR',
      canje ? 'El cliente ya no podrá canjear con este código. ¿Continuar?' : 'El cliente ya no podrá sumar puntos con este código. ¿Continuar?',
      'Anular',
    );
    if (!ok || this.qrResult?.claimId !== claimId) return;
    this.anulandoQr = true;
    this.cdr.markForCheck();
    try {
      await (canje ? this.merchant.voidRedeemQr(claimId) : this.merchant.voidQr(claimId));
      this.qrStatus = 'expired';
      this.qrAnulado = true;
      this.detenerSeguimientoQr();
      await this.mostrar('QR anulado correctamente. Ya nadie puede usarlo.', 'ok');
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo anular el QR.');
      if (e?.status === 409) this.qrStatus = 'claimed';
    } finally {
      this.anulandoQr = false;
      this.cdr.markForCheck();
    }
  }

  /** Dibuja el QR (corrección H) y pone el logo de Snacki sobre una placa blanca al centro. */
  private async dibujarQrConLogo(content: string): Promise<string> {
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, content, { errorCorrectionLevel: 'H', margin: 1, width: QR_SIZE });
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas.toDataURL('image/png');
    try {
      const logo = await this.cargarImagen(QR_LOGO_SRC);
      const size = canvas.width * QR_LOGO_RATIO;
      const plate = size * 1.12;
      const cx = canvas.width / 2;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.roundRect(cx - plate / 2, cx - plate / 2, plate, plate, plate * 0.24);
      ctx.fill();
      ctx.drawImage(logo, cx - size / 2, cx - size / 2, size, size);
    } catch {
      // Sin logo el QR sigue siendo válido.
    }
    return canvas.toDataURL('image/png');
  }

  private cargarImagen(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('logo'));
      img.src = src;
    });
  }

  private iniciarSeguimientoQr() {
    this.detenerSeguimientoQr();
    this.qrTimer = setInterval(() => this.consultarEstadoQr(), QR_POLL_MS);
  }

  private detenerSeguimientoQr() {
    if (this.qrTimer) clearInterval(this.qrTimer);
    this.qrTimer = null;
  }

  private async consultarEstadoQr() {
    const claimId = this.qrResult?.claimId;
    if (!claimId) return;
    this.actualizarRestante();
    try {
      const canje = this.qrTipo === 'canje';
      const res = canje ? await this.merchant.getRedeemQrStatus(claimId) : await this.merchant.getQrStatus(claimId);
      if (this.qrResult?.claimId !== claimId) return; // se generó otro mientras tanto
      const antes = this.qrStatus;
      this.qrStatus = res.status;
      if ('customerName' in res) {
        this.qrCliente = res.customerName;
        this.qrCodigo = res.code;
      }
      if (res.status !== 'pending') this.detenerSeguimientoQr();
      if (antes === 'pending' && res.status === 'claimed') {
        const msg = canje
          ? `¡Canje confirmado! Entrega ${this.qrResult?.product.name ?? 'la recompensa'}${this.qrCliente ? ` a ${this.qrCliente}` : ''}.`
          : `¡Listo! El cliente sumó ${this.qrResult?.points ?? 0} puntos.`;
        await this.mostrar(msg, 'ok');
      }
    } catch {
      // Sin red momentánea: se reintenta en el próximo ciclo.
    } finally {
      this.cdr.markForCheck();
    }
  }

  private actualizarRestante() {
    if (!this.qrResult) return;
    const ms = new Date(this.qrResult.expiresAt).getTime() - Date.now();
    if (ms <= 0) {
      this.qrStatus = 'expired';
      this.qrRestante = '';
      this.detenerSeguimientoQr();
      return;
    }
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    this.qrRestante = h > 0 ? `${h} h ${m} min` : `${Math.max(1, m)} min`;
  }

  private limpiarQr() {
    this.detenerSeguimientoQr();
    this.qrResult = null;
    this.qrImage = '';
    this.qrStatus = 'pending';
    this.qrRestante = '';
    this.qrAnulado = false;
    this.qrCliente = null;
    this.qrCodigo = null;
  }

  ionViewWillLeave() {
    this.detenerSeguimientoQr();
  }

  ngOnDestroy() {
    this.detenerSeguimientoQr();
  }

  /** Cada modal solo se cierra a sí mismo: evita que un didDismiss tardío cierre el modal siguiente. */
  onModalDismiss(kind: Exclude<ModalKind, null>) {
    if (kind === 'qr') this.limpiarQr();
    if (this.modal === kind) this.modal = null;
    if (kind === 'map' && this.abrirSettingsTrasMapa) {
      this.abrirSettingsTrasMapa = false;
      this.abrirSettings();
    }
    this.cdr.markForCheck();
  }

  cerrarModal() {
    this.modal = null;
  }

  async guardarPromo() {
    if (this.saving || this.procesandoImagenPromo) return;
    const puntos = Number(this.puntosPromo);
    const puntosValido = Number.isInteger(puntos) && puntos > 0 && puntos <= 100000;
    const nombre = this.nombrePromo.trim();
    if (!nombre || !puntosValido || !this.promoStartsAt || !this.promoEndsAt) {
      await this.mostrar('Completa nombre, puntos y fechas de inicio y fin.');
      return;
    }
    const inicio = new Date(this.promoStartsAt);
    const fin = new Date(this.promoEndsAt);
    if (fin <= inicio) {
      await this.mostrar('La fecha de fin debe ser posterior a la de inicio.');
      return;
    }
    const editando = !!this.editingPromoId;
    this.saving = true;
    try {
      const payload: { name: string; description: string | null; points: number; promoStartsAt: string; promoEndsAt: string; isActive: boolean; imageUrl?: string | null } = {
        name: nombre,
        description: this.descripcionPromo.trim() || null,
        points: puntos,
        promoStartsAt: inicio.toISOString(),
        promoEndsAt: fin.toISOString(),
        isActive: this.promoActiva,
      };
      // Al editar solo se reenvía la imagen si cambió (puede pesar cientos de KB); null la elimina.
      const imagenOriginal = this.products.find((p) => p.id === this.editingPromoId)?.imageUrl ?? '';
      const imagenCambio = editando ? this.imagenPromo !== imagenOriginal : !!this.imagenPromo;
      if (imagenCambio) payload.imageUrl = this.imagenPromo || null;
      if (this.editingPromoId) {
        await this.merchant.updateProduct(this.editingPromoId, payload);
      } else {
        await this.merchant.createProduct(payload);
      }
      this.modal = null;
      await this.loadAll();
      await this.mostrar(editando ? 'Promo actualizada correctamente.' : 'Promo publicada correctamente.', 'ok');
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo guardar la promo.');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async eliminarPromo(product: MerchantProduct) {
    if (!(await this.confirmar('Eliminar promo', `¿Seguro que quieres eliminar "${product.name}"?`))) return;
    try {
      const res = await this.merchant.deleteProduct(product.id);
      await this.loadAll();
      await this.mostrar(res.archived ? 'Promo eliminada. Sus ventas anteriores quedan en el historial.' : 'Promo eliminada correctamente.', 'ok');
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo eliminar la promo.');
    }
  }

  async guardarRecompensa() {
    if (this.saving || this.procesandoImagenRecompensa) return;
    const puntos = Number(this.costoPuntos);
    const costoValido = Number.isInteger(puntos) && puntos > 0 && puntos <= 100000;
    const nombre = this.nombreRecompensa.trim();
    if (!nombre || !costoValido) {
      await this.mostrar('Revisa el nombre y el costo en puntos.');
      return;
    }
    const editando = !!this.editingRewardId;
    this.saving = true;
    try {
      const payload: { name: string; description: string | null; cost: number; imageUrl?: string | null } = {
        name: nombre,
        description: this.descripcionRecompensa.trim() || null,
        cost: puntos,
      };
      const imagenOriginal = this.rewards.find((r) => r.id === this.editingRewardId)?.imageUrl ?? '';
      const imagenCambio = editando ? this.imagenRecompensa !== imagenOriginal : !!this.imagenRecompensa;
      if (imagenCambio) payload.imageUrl = this.imagenRecompensa || null;
      if (this.editingRewardId) {
        await this.merchant.updateReward(this.editingRewardId, payload);
      } else {
        await this.merchant.createReward(payload);
      }
      this.modal = null;
      await this.loadAll();
      await this.mostrar(editando ? 'Recompensa actualizada correctamente.' : 'Recompensa creada correctamente.', 'ok');
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo guardar la recompensa.');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  async eliminarRecompensa(reward: MerchantReward) {
    if (!(await this.confirmar('Eliminar recompensa', `¿Seguro que quieres eliminar "${reward.name}"?`))) return;
    try {
      const res = await this.merchant.deleteReward(reward.id);
      await this.loadAll();
      await this.mostrar(res.archived ? 'Recompensa eliminada. Sus canjes anteriores quedan en el historial.' : 'Recompensa eliminada correctamente.', 'ok');
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo eliminar la recompensa.');
    }
  }

  async guardarSettings() {
    if (this.saving || this.procesandoLogo) return;
    if (!this.settingsName.trim()) {
      await this.mostrar('El nombre de la tienda es obligatorio.');
      return;
    }
    this.saving = true;
    try {
      await this.merchant.updateSettings({
        name: this.settingsName.trim(),
        category: this.settingsCategory,
        address: this.settingsAddress.trim() || null,
        latitude: this.settingsLat === '' || this.settingsLat === null ? null : Number(this.settingsLat),
        longitude: this.settingsLng === '' || this.settingsLng === null ? null : Number(this.settingsLng),
        logoUrl: this.settingsLogoUrl.trim() || null,
        pointsExpireAt: this.settingsPointsExpireAt ? new Date(this.settingsPointsExpireAt).toISOString() : null,
      });
      this.modal = null;
      await this.loadAll();
      await this.mostrar('Configuración guardada correctamente.', 'ok');
    } catch (e: any) {
      await this.mostrarError(e, 'No se pudo guardar la configuración.');
    } finally {
      this.saving = false;
      this.cdr.markForCheck();
    }
  }

  usarMiUbicacion() {
    if (!navigator.geolocation) {
      this.mostrar('Tu navegador no permite obtener la ubicación.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.settingsLat = Number(pos.coords.latitude.toFixed(6));
        this.settingsLng = Number(pos.coords.longitude.toFixed(6));
        this.actualizarMapaSettings();
        this.cdr.markForCheck();
      },
      () => this.mostrar('No se pudo obtener tu ubicación.'),
    );
  }

  // ---------- logo ----------

  async onLogoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      await this.mostrar('El logo debe ser una imagen PNG o JPG.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      await this.mostrar('La imagen supera los 5 MB.');
      return;
    }
    this.procesandoLogo = true;
    this.cdr.markForCheck();
    try {
      this.settingsLogoUrl = await this.redimensionarImagen(file, 512);
    } catch {
      await this.mostrar('No se pudo leer la imagen.');
    } finally {
      this.procesandoLogo = false;
      this.cdr.markForCheck();
    }
  }

  quitarLogo() {
    this.settingsLogoUrl = '';
  }

  // ---------- fotos de promos y recompensas ----------

  /** Foto elegida en el formulario de una promo o recompensa (al crear o al editar). */
  async onFotoSeleccionada(event: Event, destino: FotoDestino) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!file) return;
    if (!(await this.validarFoto(file))) return;

    this.setProcesandoFoto(destino, true);
    try {
      const data = await this.prepararFoto(file);
      if (destino === 'promo') this.imagenPromo = data;
      else this.imagenRecompensa = data;
    } catch {
      await this.mostrar('No se pudo leer la imagen. Prueba con otra foto.');
    } finally {
      this.setProcesandoFoto(destino, false);
    }
  }

  quitarFoto(destino: FotoDestino) {
    if (destino === 'promo') this.imagenPromo = '';
    else this.imagenRecompensa = '';
  }

  /** Foto actual del formulario (el selector de imagen se comparte entre promo y recompensa). */
  fotoDe(destino: FotoDestino): string {
    return destino === 'promo' ? this.imagenPromo : this.imagenRecompensa;
  }

  procesandoFoto(destino: FotoDestino): boolean {
    return destino === 'promo' ? this.procesandoImagenPromo : this.procesandoImagenRecompensa;
  }

  private async validarFoto(file: File): Promise<boolean> {
    if (!FOTO_TIPOS.includes(file.type)) {
      await this.mostrar('La foto debe ser una imagen PNG, JPG o WebP.');
      return false;
    }
    if (file.size > FOTO_MAX_BYTES) {
      await this.mostrar('La imagen supera los 15 MB.');
      return false;
    }
    return true;
  }

  private setProcesandoFoto(destino: FotoDestino, valor: boolean) {
    if (destino === 'promo') this.procesandoImagenPromo = valor;
    else this.procesandoImagenRecompensa = valor;
    this.cdr.markForCheck();
  }

  /**
   * Convierte la foto en JPEG (fondo blanco si tenía transparencia) de hasta 800 px y, si aún pesa
   * demasiado para el backend, vuelve a comprimirla con menos calidad/tamaño.
   */
  private async prepararFoto(file: File): Promise<string> {
    const intentos: Array<[number, number]> = [[800, 0.82], [800, 0.7], [640, 0.65], [512, 0.55]];
    for (const [max, calidad] of intentos) {
      const data = await this.redimensionarImagen(file, max, 'image/jpeg', calidad);
      if (data.length <= IMAGEN_MAX_CHARS) return data;
    }
    throw new Error('size');
  }

  /**
   * Reduce la imagen a `max` px de lado y la devuelve como data URL. Por defecto conserva el formato
   * del archivo (el PNG mantiene la transparencia); con `image/jpeg` se rellena el fondo de blanco.
   */
  private redimensionarImagen(file: File, max: number, tipo: string = file.type, calidad = 0.85): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('canvas'));
        if (tipo === 'image/jpeg') {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(tipo === 'image/png' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', calidad));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('image'));
      };
      img.src = url;
    });
  }

  async cerrarSesion() {
    await this.auth.cerrarSesion();
    await this.nav.navigateRoot('/login', { replaceUrl: true });
  }

  private toLocalInput(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private async confirmar(header: string, message: string, accion = 'Eliminar'): Promise<boolean> {
    const alert = await this.alert.create({
      header,
      message,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: accion, role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive';
  }

  /** Mensaje claro para un error de la API: sin conexión, fallo del servidor o el motivo que explica el backend. */
  private async mostrarError(e: any, fallback: string) {
    const status: number | undefined = e?.status;
    const err = e?.error?.error;
    let msg: string;
    if (status === 0) msg = 'Sin conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
    else if (status === 401) msg = 'Tu sesión expiró. Vuelve a iniciar sesión.';
    else if (!status || status >= 500) msg = `${fallback} Inténtalo de nuevo en unos segundos.`;
    else msg = err?.details?.[0]?.message || err?.message || fallback;
    await this.mostrar(msg, 'error');
  }

  /** Aviso arriba de la pantalla: verde con sonido si salió bien, rojo si falló, azul si es informativo. */
  private async mostrar(message: string, tipo: Aviso = 'error') {
    if (tipo === 'ok') playSuccessChime();
    const icon = tipo === 'ok' ? 'checkmark-circle' : tipo === 'error' ? 'alert-circle' : 'information-circle';
    const toast = await this.toast.create({
      message,
      icon,
      duration: tipo === 'error' ? 4000 : 2600,
      position: 'top',
      cssClass: `snacki-toast snacki-toast-${tipo}`,
      buttons: [{ icon: 'close', role: 'cancel', side: 'end' }],
    });
    await toast.present();
  }
}
