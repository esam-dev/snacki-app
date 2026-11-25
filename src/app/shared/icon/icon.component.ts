import { ChangeDetectionStrategy, Component, ElementRef, Renderer2, effect, inject, input } from '@angular/core';
import {
  ChartColumn,
  ChevronRight,
  Circle,
  CircleCheck,
  Clock,
  ExternalLink,
  Gift,
  Image,
  ImagePlus,
  Info,
  LayoutGrid,
  LocateFixed,
  LogOut,
  Map,
  MapPin,
  Minus,
  Pencil,
  Plus,
  QrCode,
  RefreshCw,
  Settings,
  Store,
  Tag,
  Trash,
  Upload,
  X,
  type IconNode,
} from 'lucide';

/** Registro explícito: solo se empaquetan los íconos usados. */
const ICONS = {
  'chart': ChartColumn,
  'chevron-right': ChevronRight,
  'circle': Circle,
  'circle-check': CircleCheck,
  'clock': Clock,
  'external-link': ExternalLink,
  'gift': Gift,
  'image': Image,
  'image-plus': ImagePlus,
  'info': Info,
  'grid': LayoutGrid,
  'locate': LocateFixed,
  'log-out': LogOut,
  'map': Map,
  'map-pin': MapPin,
  'minus': Minus,
  'pencil': Pencil,
  'plus': Plus,
  'qr': QrCode,
  'refresh': RefreshCw,
  'settings': Settings,
  'store': Store,
  'tag': Tag,
  'trash': Trash,
  'upload': Upload,
  'close': X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Ícono de línea (set Lucide) renderizado como SVG inline.
 * Hereda el color del texto (`currentColor`); el tamaño sigue el `font-size` del host.
 */
@Component({
  selector: 'app-icon',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-icon', 'aria-hidden': 'true' },
  styles: [':host{display:inline-flex;flex-shrink:0;width:1em;height:1em;line-height:0} :host svg{width:100%;height:100%}'],
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly strokeWidth = input(1.75);

  private host = inject(ElementRef<HTMLElement>);
  private r = inject(Renderer2);

  constructor() {
    effect(() => {
      const el = this.host.nativeElement as HTMLElement;
      el.replaceChildren();
      const svg = this.r.createElement('svg', SVG_NS) as SVGElement;
      const attrs: Record<string, string> = {
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': String(this.strokeWidth()),
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        focusable: 'false',
      };
      for (const [k, v] of Object.entries(attrs)) this.r.setAttribute(svg, k, v);
      for (const [tag, nodeAttrs] of ICONS[this.name()]) {
        const child = this.r.createElement(tag, SVG_NS);
        for (const [k, v] of Object.entries(nodeAttrs ?? {})) this.r.setAttribute(child, k, String(v));
        this.r.appendChild(svg, child);
      }
      this.r.appendChild(el, svg);
    });
  }
}
