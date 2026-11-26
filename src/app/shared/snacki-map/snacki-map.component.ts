import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input,
  output, signal, untracked,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { Punto, TAMANO_TESELA, desproyectar, proyectar } from '../geo';

export interface MapaMarcador {
  id: string;
  lat: number;
  lng: number;
  etiqueta?: string;
  activo?: boolean;
}

const ZOOM_MIN = 2;
const ZOOM_MAX = 18;
const UMBRAL_ARRASTRE_PX = 5;

const limitarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z)));

/**
 * Mapa interactivo sin dependencias: teselas de OpenStreetMap, arrastre, zoom, marcadores,
 * posición del usuario y (opcional) un pin que se coloca tocando el mapa.
 *
 * - `centro`/`zoom`: fijan la vista (cada cambio de `centro` recentra el mapa).
 * - Sin `centro`, el mapa se ajusta solo a `ajustar` o, si no se indica, a los marcadores y al usuario.
 * - Una vez que la persona mueve el mapa, los cambios de marcadores ya no lo recentran.
 */
@Component({
  selector: 'app-snacki-map',
  templateUrl: './snacki-map.component.html',
  styleUrls: ['./snacki-map.component.scss'],
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SnackiMapComponent {
  readonly centro = input<Punto | null>(null);
  readonly zoom = input(15);
  readonly marcadores = input<MapaMarcador[]>([]);
  readonly usuario = input<Punto | null>(null);
  readonly pin = input<Punto | null>(null);
  readonly ajustar = input<Punto[] | null>(null);
  /** Si es true, tocar el mapa emite `puntoElegido` con las coordenadas tocadas. */
  readonly seleccionable = input(false);

  readonly marcadorClick = output<string>();
  readonly puntoElegido = output<Punto>();

  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private destroyRef = inject(DestroyRef);

  private readonly vista = signal<Punto>({ lat: 0, lng: 0 });
  readonly zoomActual = signal(ZOOM_MIN);
  private readonly tamano = signal({ w: 320, h: 240 });
  private interactuo = false;
  private medido = false;
  private arrastre: { id: number; x: number; y: number; inicioX: number; inicioY: number; movido: boolean } | null = null;

  /** Esquina superior izquierda de la vista, en píxeles del mundo al zoom actual. */
  private readonly origen = computed(() => {
    const centro = this.vista();
    const { w, h } = this.tamano();
    const p = proyectar(centro.lat, centro.lng, this.zoomActual());
    return { x: p.x - w / 2, y: p.y - h / 2 };
  });

  readonly teselas = computed(() => {
    const z = this.zoomActual();
    const { w, h } = this.tamano();
    const o = this.origen();
    const n = 2 ** z;
    const lista: { clave: string; src: string; x: number; y: number }[] = [];
    for (let ty = Math.floor(o.y / TAMANO_TESELA); ty <= Math.floor((o.y + h) / TAMANO_TESELA); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(o.x / TAMANO_TESELA); tx <= Math.floor((o.x + w) / TAMANO_TESELA); tx++) {
        const txReal = ((tx % n) + n) % n;
        lista.push({
          clave: `${z}/${tx}/${ty}`,
          src: `https://tile.openstreetmap.org/${z}/${txReal}/${ty}.png`,
          x: Math.round(tx * TAMANO_TESELA - o.x),
          y: Math.round(ty * TAMANO_TESELA - o.y),
        });
      }
    }
    return lista;
  });

  readonly marcadoresPx = computed(() => {
    const z = this.zoomActual();
    const o = this.origen();
    return this.marcadores().map((m) => {
      const p = proyectar(m.lat, m.lng, z);
      return { ...m, x: Math.round(p.x - o.x), y: Math.round(p.y - o.y) };
    });
  });

  readonly usuarioPx = computed(() => this.aPixeles(this.usuario()));
  readonly pinPx = computed(() => this.aPixeles(this.pin()));

  constructor() {
    effect(() => {
      const centro = this.centro();
      const zoom = this.zoom();
      if (!centro) return;
      untracked(() => {
        this.vista.set(centro);
        this.zoomActual.set(limitarZoom(zoom));
        this.interactuo = false;
      });
    });

    effect(() => {
      const puntos = this.ajustar() ?? [
        ...this.marcadores().map((m) => ({ lat: m.lat, lng: m.lng })),
        ...(this.usuario() ? [this.usuario()!] : []),
      ];
      untracked(() => {
        if (this.centro() || this.interactuo) return;
        this.ajustarA(puntos);
      });
    });

    afterNextRender(() => {
      const el = this.host.nativeElement;
      const medir = () => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        this.tamano.set({ w: r.width, h: r.height });
        if (!this.medido) {
          this.medido = true;
          // Con el tamaño real se vuelve a calcular el ajuste inicial.
          if (!this.centro() && !this.interactuo) this.ajustarA(this.puntosParaAjustar());
        }
      };
      medir();
      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(medir);
        observer.observe(el);
        this.destroyRef.onDestroy(() => observer.disconnect());
      }
    });
  }

  // ---------- interacción ----------

  alPresionar(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.arrastre = { id: e.pointerId, x: e.clientX, y: e.clientY, inicioX: e.clientX, inicioY: e.clientY, movido: false };
  }

  alMover(e: PointerEvent) {
    const a = this.arrastre;
    if (!a || a.id !== e.pointerId) return;
    if (!a.movido && Math.hypot(e.clientX - a.inicioX, e.clientY - a.inicioY) < UMBRAL_ARRASTRE_PX) return;
    a.movido = true;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    a.x = e.clientX;
    a.y = e.clientY;
    this.desplazar(-dx, -dy);
  }

  alSoltar(e: PointerEvent) {
    const a = this.arrastre;
    this.arrastre = null;
    if (!a || a.id !== e.pointerId || a.movido || !this.seleccionable()) return;
    const rect = this.host.nativeElement.getBoundingClientRect();
    const o = this.origen();
    const punto = desproyectar(o.x + (e.clientX - rect.left), o.y + (e.clientY - rect.top), this.zoomActual());
    this.puntoElegido.emit({ lat: Number(punto.lat.toFixed(6)), lng: Number(punto.lng.toFixed(6)) });
  }

  cancelarArrastre() {
    this.arrastre = null;
  }

  alRueda(e: WheelEvent) {
    e.preventDefault();
    this.cambiarZoom(e.deltaY < 0 ? 1 : -1);
  }

  acercar() { this.cambiarZoom(1); }
  alejar() { this.cambiarZoom(-1); }

  detener(e: Event) {
    e.stopPropagation();
  }

  // ---------- internos ----------

  private cambiarZoom(delta: number) {
    const nuevo = limitarZoom(this.zoomActual() + delta);
    if (nuevo === this.zoomActual()) return;
    this.interactuo = true;
    this.zoomActual.set(nuevo);
  }

  private desplazar(dx: number, dy: number) {
    const z = this.zoomActual();
    const c = proyectar(this.vista().lat, this.vista().lng, z);
    const destino = desproyectar(c.x + dx, c.y + dy, z);
    this.interactuo = true;
    this.vista.set({ lat: Math.max(-85, Math.min(85, destino.lat)), lng: destino.lng });
  }

  private aPixeles(punto: Punto | null) {
    if (!punto) return null;
    const p = proyectar(punto.lat, punto.lng, this.zoomActual());
    const o = this.origen();
    return { x: Math.round(p.x - o.x), y: Math.round(p.y - o.y) };
  }

  private puntosParaAjustar(): Punto[] {
    return this.ajustar() ?? [
      ...this.marcadores().map((m) => ({ lat: m.lat, lng: m.lng })),
      ...(this.usuario() ? [this.usuario()!] : []),
    ];
  }

  /** Centra y escala la vista para que quepan todos los puntos. */
  private ajustarA(puntos: Punto[]) {
    if (!puntos.length) return;
    if (puntos.length === 1) {
      this.vista.set(puntos[0]);
      this.zoomActual.set(16);
      return;
    }
    const { w, h } = this.tamano();
    for (let z = 17; z >= ZOOM_MIN; z--) {
      const px = puntos.map((p) => proyectar(p.lat, p.lng, z));
      const xs = px.map((p) => p.x);
      const ys = px.map((p) => p.y);
      const ancho = Math.max(...xs) - Math.min(...xs);
      const alto = Math.max(...ys) - Math.min(...ys);
      if ((ancho <= w * 0.75 && alto <= h * 0.7) || z === ZOOM_MIN) {
        const centro = desproyectar((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, z);
        this.vista.set(centro);
        this.zoomActual.set(z);
        return;
      }
    }
  }
}
