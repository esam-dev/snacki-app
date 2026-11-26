/** Utilidades geográficas puras (sin Angular): distancias, proyección del mapa y enlaces. */

export interface Punto {
  lat: number;
  lng: number;
}

export const TAMANO_TESELA = 256;
const RADIO_TIERRA_M = 6_371_000;
const LAT_MAX = 85.0511; // límite de la proyección Web Mercator

export function esCoordenadaValida(lat: unknown, lng: unknown): boolean {
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Distancia en metros entre dos puntos (fórmula de Haversine). */
export function distanciaMetros(a: Punto, b: Punto): number {
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m", "1,2 km", "15 km". */
export function formatearDistancia(metros: number): string {
  if (!Number.isFinite(metros) || metros < 0) return '';
  if (metros < 1000) return `${Math.max(10, Math.round(metros / 10) * 10)} m`;
  const km = metros / 1000;
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
}

/** Punto en píxeles del "mundo" a un nivel de zoom (Web Mercator, teselas de 256 px). */
export function proyectar(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const tamano = TAMANO_TESELA * 2 ** zoom;
  const seno = Math.min(Math.max(Math.sin((Math.max(-LAT_MAX, Math.min(LAT_MAX, lat)) * Math.PI) / 180), -0.9999), 0.9999);
  return {
    x: ((lng + 180) / 360) * tamano,
    y: (0.5 - Math.log((1 + seno) / (1 - seno)) / (4 * Math.PI)) * tamano,
  };
}

/** Inversa de `proyectar`. */
export function desproyectar(x: number, y: number, zoom: number): Punto {
  const tamano = TAMANO_TESELA * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * y) / tamano;
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: (x / tamano) * 360 - 180,
  };
}

/** Enlace público de Google Maps con la ruta hacia el destino. */
export function urlComoLlegar(destino: Punto): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destino.lat},${destino.lng}`;
}
