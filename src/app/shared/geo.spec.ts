import { describe, expect, it } from 'vitest';
import { desproyectar, distanciaMetros, esCoordenadaValida, formatearDistancia, proyectar, urlComoLlegar } from './geo';

describe('geo', () => {
  it('calcula la distancia entre dos puntos cercanos', () => {
    const d = distanciaMetros({ lat: -33.4372, lng: -70.6506 }, { lat: -33.441, lng: -70.648 });
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(520);
  });

  it('calcula distancias largas y es simétrica', () => {
    const santiago = { lat: -33.4489, lng: -70.6693 };
    const buenosAires = { lat: -34.6037, lng: -58.3816 };
    const km = distanciaMetros(santiago, buenosAires) / 1000;
    expect(km).toBeGreaterThan(1100);
    expect(km).toBeLessThan(1180);
    expect(distanciaMetros(buenosAires, santiago)).toBeCloseTo(distanciaMetros(santiago, buenosAires), 6);
  });

  it('formatea la distancia', () => {
    expect(formatearDistancia(3)).toBe('10 m');
    expect(formatearDistancia(850)).toBe('850 m');
    expect(formatearDistancia(1234)).toBe('1,2 km');
    expect(formatearDistancia(15400)).toBe('15 km');
    expect(formatearDistancia(Number.NaN)).toBe('');
  });

  it('proyecta y desproyecta sin pérdida', () => {
    for (const zoom of [2, 10, 16]) {
      const p = proyectar(-33.4372, -70.6506, zoom);
      const punto = desproyectar(p.x, p.y, zoom);
      expect(punto.lat).toBeCloseTo(-33.4372, 6);
      expect(punto.lng).toBeCloseTo(-70.6506, 6);
    }
  });

  it('valida coordenadas', () => {
    expect(esCoordenadaValida(-33.4, -70.6)).toBe(true);
    expect(esCoordenadaValida(91, 0)).toBe(false);
    expect(esCoordenadaValida(null, 10)).toBe(false);
  });

  it('arma el enlace de cómo llegar', () => {
    expect(urlComoLlegar({ lat: -33.4372, lng: -70.6506 })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-33.4372,-70.6506',
    );
  });
});
