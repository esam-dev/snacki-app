import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject, output } from '@angular/core';
import { DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { MerchantRedemption, MerchantService, MerchantStats, StatsRange } from '../../../services/merchant.service';
import { IconComponent } from '../../../shared/icon/icon.component';

export const RANGOS: ReadonlyArray<{ valor: StatsRange; etiqueta: string }> = [
  { valor: '7d', etiqueta: '7 días' },
  { valor: '30d', etiqueta: '30 días' },
  { valor: '90d', etiqueta: '90 días' },
  { valor: 'all', etiqueta: 'Todo' },
];

const PAGINA_CANJES = 20;

/**
 * Estadísticas del local por período (puntos, canjes, recompra, promo top y referidos)
 * y el historial de canjes con el código y el cliente, paginado.
 */
@Component({
  selector: 'app-estadisticas-comercio',
  templateUrl: './estadisticas-comercio.component.html',
  styleUrls: ['./estadisticas-comercio.component.scss'],
  imports: [DatePipe, DecimalPipe, PercentPipe, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EstadisticasComercioComponent implements OnInit {
  private merchant = inject(MerchantService);
  private cdr = inject(ChangeDetectorRef);

  /** Mensaje para el aviso de la página. */
  readonly aviso = output<{ texto: string; tipo: 'ok' | 'error' | 'info' }>();

  readonly rangos = RANGOS;
  rango: StatsRange = '30d';
  stats: MerchantStats | null = null;
  cargandoStats = true;
  errorStats = false;

  canjes: MerchantRedemption[] = [];
  cursor: string | null = null;
  cargandoCanjes = true;
  cargandoMas = false;

  ngOnInit() {
    void this.cargarStats();
    void this.cargarCanjes();
  }

  /** % de clientes del período que volvieron a comprar. */
  get tasaRecompra(): number | null {
    const s = this.stats;
    return s && s.uniqueCustomers ? s.returningCustomers / s.uniqueCustomers : null;
  }

  elegirRango(r: StatsRange) {
    if (r === this.rango && this.stats) return;
    this.rango = r;
    void this.cargarStats();
  }

  async cargarStats() {
    const pedido = this.rango;
    this.cargandoStats = true;
    this.errorStats = false;
    this.cdr.markForCheck();
    try {
      const stats = await this.merchant.getStats(pedido);
      // Si el usuario cambió de período mientras cargaba, gana el último.
      if (pedido === this.rango) this.stats = stats;
    } catch {
      if (pedido === this.rango) this.errorStats = true;
    } finally {
      if (pedido === this.rango) this.cargandoStats = false;
      this.cdr.markForCheck();
    }
  }

  async cargarCanjes() {
    this.cargandoCanjes = true;
    this.cdr.markForCheck();
    try {
      const { redemptions, nextCursor } = await this.merchant.listRedemptions({ limit: PAGINA_CANJES });
      this.canjes = redemptions;
      this.cursor = nextCursor;
    } catch {
      this.aviso.emit({ texto: 'No se pudieron cargar los canjes.', tipo: 'error' });
    } finally {
      this.cargandoCanjes = false;
      this.cdr.markForCheck();
    }
  }

  async verMas() {
    if (!this.cursor || this.cargandoMas) return;
    this.cargandoMas = true;
    this.cdr.markForCheck();
    try {
      const { redemptions, nextCursor } = await this.merchant.listRedemptions({ limit: PAGINA_CANJES, before: this.cursor });
      this.canjes = [...this.canjes, ...redemptions];
      this.cursor = nextCursor;
    } catch {
      this.aviso.emit({ texto: 'No se pudieron cargar más canjes.', tipo: 'error' });
    } finally {
      this.cargandoMas = false;
      this.cdr.markForCheck();
    }
  }

  async refrescar() {
    await Promise.all([this.cargarStats(), this.cargarCanjes()]);
  }
}
