import { Injectable } from '@angular/core';

export interface Producto {
  nombre: string;
  puntos: number;
  imagen: string;
}

export interface Local {
  id: string;
  nombre: string;
  logo: string;
  /** Puntos que el usuario tiene acumulados en este local */
  puntos: number;
  /** Fecha de vencimiento de los puntos (ISO yyyy-MM-dd) */
  vencimiento: string;
  productos: Producto[];
}

/**
 * Datos de ejemplo tomados del diseño de Figma.
 * Cuando exista un backend, reemplazar por llamadas HttpClient.
 */
@Injectable({ providedIn: 'root' })
export class StoreService {
  private readonly locales: Local[] = [
    {
      id: 'burger-house',
      nombre: 'Burger House',
      logo: 'assets/img/logo-burger-house.png',
      puntos: 1250,
      vencimiento: '2027-01-01',
      productos: [
        { nombre: 'Combo Bacon Burger', puntos: 600, imagen: 'assets/img/prod-combo-bacon.jpg' },
        { nombre: 'Helado de Vainilla', puntos: 100, imagen: 'assets/img/prod-helado.jpg' },
        { nombre: 'Nuggets de Pollo', puntos: 300, imagen: 'assets/img/prod-nuggets.jpg' },
        { nombre: 'Ensalada Cesar', puntos: 400, imagen: 'assets/img/prod-ensalada.jpg' },
      ],
    },
    {
      id: 'pizza-hut',
      nombre: 'Pizza Hut',
      logo: 'assets/img/logo-pizza-hut.png',
      puntos: 6250,
      vencimiento: '2027-01-03',
      productos: [],
    },
    {
      id: 'quattro-d',
      nombre: 'Quattro d',
      logo: 'assets/img/logo-quattro-d.png',
      puntos: 3000,
      vencimiento: '2027-01-02',
      productos: [],
    },
    {
      id: 'spaghettoteca',
      nombre: 'Spaghettoteca',
      logo: 'assets/img/logo-spaghettoteca.png',
      puntos: 2000,
      vencimiento: '2027-01-05',
      productos: [],
    },
  ];

  getAll(): Local[] {
    return this.locales;
  }

  getById(id: string | null | undefined): Local | undefined {
    return this.locales.find((l) => l.id === id);
  }

  buscar(texto: string): Local[] {
    const q = texto.trim().toLowerCase();
    return q ? this.locales.filter((l) => l.nombre.toLowerCase().includes(q)) : this.locales;
  }

  get totalPuntos(): number {
    return this.locales.reduce((sum, l) => sum + l.puntos, 0);
  }
}
