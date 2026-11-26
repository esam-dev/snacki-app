import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AlertController } from '@ionic/angular';
import { ChangeRequest, MerchantService } from '../../../services/merchant.service';
import { IconComponent } from '../../../shared/icon/icon.component';

const ACCION: Record<ChangeRequest['action'], string> = { create: 'Crear', update: 'Editar', delete: 'Eliminar' };
const ENTIDAD: Record<ChangeRequest['entity'], string> = { product: 'promo', reward: 'recompensa' };
const CAMPOS: Record<string, string> = {
  name: 'Nombre', description: 'Descripción', points: 'Puntos', cost: 'Costo (PTS)',
  promoStartsAt: 'Inicio', promoEndsAt: 'Fin', isActive: 'Activa', imageUrl: 'Foto',
};

/**
 * Solicitudes de cambio de promos y recompensas. El titular las aprueba o rechaza;
 * el asistente (sucursal) ve el estado de las que envió.
 */
@Component({
  selector: 'app-solicitudes-cambio',
  templateUrl: './solicitudes-cambio.component.html',
  styleUrls: ['./solicitudes-cambio.component.scss'],
  imports: [DatePipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SolicitudesCambioComponent implements OnInit {
  private merchant = inject(MerchantService);
  private alert = inject(AlertController);
  private cdr = inject(ChangeDetectorRef);

  /** true para el titular (revisa); false para el asistente (solo consulta). */
  readonly puedeRevisar = input(false);
  /** Cantidad de pendientes: la página la usa en la pestaña. */
  readonly pendientes = output<number>();
  /** Se aprobó un cambio: la página recarga promos y recompensas. */
  readonly aplicado = output<void>();
  /** Mensaje para el aviso de la página. */
  readonly aviso = output<{ texto: string; tipo: 'ok' | 'error' | 'info' }>();

  solicitudes: ChangeRequest[] = [];
  cargando = true;
  trabajando: string | null = null;

  ngOnInit() { void this.cargar(); }

  async cargar() {
    this.cargando = true;
    try {
      const { requests, pending } = await this.merchant.listChangeRequests();
      this.solicitudes = requests;
      this.pendientes.emit(pending);
    } catch {
      this.aviso.emit({ texto: 'No se pudieron cargar las solicitudes.', tipo: 'error' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  titulo(r: ChangeRequest): string {
    return `${ACCION[r.action]} ${ENTIDAD[r.entity]}${r.targetName ? `: ${r.targetName}` : ''}`;
  }

  estado(r: ChangeRequest): string {
    return r.status === 'PENDING' ? 'Pendiente' : r.status === 'APPROVED' ? 'Aprobada' : 'Rechazada';
  }

  /** Resumen legible de los datos propuestos (sin la foto, que pesa y no se puede mostrar en una línea). */
  detalle(r: ChangeRequest): { campo: string; valor: string }[] {
    if (!r.payload) return [];
    return Object.entries(r.payload)
      .filter(([k, v]) => k in CAMPOS && v !== undefined)
      .map(([k, v]) => ({ campo: CAMPOS[k], valor: this.valor(k, v) }));
  }

  private valor(campo: string, v: unknown): string {
    if (campo === 'imageUrl') return v ? 'Foto nueva' : 'Sin foto';
    if (campo === 'isActive') return v ? 'Sí' : 'No (pausada)';
    if (campo === 'promoStartsAt' || campo === 'promoEndsAt') return new Date(String(v)).toLocaleString('es');
    return v === null || v === '' ? '—' : String(v);
  }

  async aprobar(r: ChangeRequest) {
    if (this.trabajando) return;
    this.trabajando = r.id;
    this.cdr.markForCheck();
    try {
      await this.merchant.approveChange(r.id);
      this.aviso.emit({ texto: 'Cambio aprobado y publicado.', tipo: 'ok' });
      this.aplicado.emit();
    } catch (e: any) {
      this.aviso.emit({ texto: e?.error?.error?.message || 'No se pudo aprobar el cambio.', tipo: 'error' });
    } finally {
      this.trabajando = null;
      await this.cargar();
    }
  }

  async rechazar(r: ChangeRequest) {
    if (this.trabajando) return;
    const dialogo = await this.alert.create({
      header: 'Rechazar cambio',
      message: `${this.titulo(r)}. Puedes indicar el motivo para la sucursal.`,
      inputs: [{ name: 'motivo', type: 'text', placeholder: 'Motivo (opcional)', attributes: { maxlength: 300 } }],
      buttons: [{ text: 'Cancelar', role: 'cancel' }, { text: 'Rechazar', role: 'confirm' }],
    });
    await dialogo.present();
    const { role, data } = await dialogo.onDidDismiss();
    if (role !== 'confirm') return;
    this.trabajando = r.id;
    this.cdr.markForCheck();
    try {
      await this.merchant.rejectChange(r.id, data?.values?.motivo);
      this.aviso.emit({ texto: 'Cambio rechazado.', tipo: 'info' });
    } catch (e: any) {
      this.aviso.emit({ texto: e?.error?.error?.message || 'No se pudo rechazar el cambio.', tipo: 'error' });
    } finally {
      this.trabajando = null;
      await this.cargar();
    }
  }
}
