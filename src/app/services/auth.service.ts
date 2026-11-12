import { Injectable } from '@angular/core';

export interface SnackiUser {
  nombre: string;
  correo: string;
}

const SESSION_KEY = 'snacki.current-user';
const PROFILES_KEY = 'snacki.profiles';

/** Sesión local de demostración. La autenticación real requiere un backend. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private usuarioActual: SnackiUser | null = this.leerSesion();

  get currentUser(): SnackiUser | null {
    return this.usuarioActual;
  }

  iniciarSesion(identificador: string, password: string): boolean {
    const valor = identificador.trim();
    if (!valor || !password.trim()) return false;

    const perfiles = this.leerPerfiles();
    const perfilGuardado = perfiles.find((perfil) =>
      perfil.correo.toLowerCase() === valor.toLowerCase() || perfil.nombre.toLowerCase() === valor.toLowerCase(),
    );
    const nombre = perfilGuardado?.nombre ?? this.nombreDesdeIdentificador(valor);
    const correo = perfilGuardado?.correo ?? (valor.includes('@') ? valor : '');

    this.guardarSesion({ nombre, correo });
    return true;
  }

  registrar(nombre: string, correo: string) {
    const perfil = { nombre: this.formatearNombre(nombre), correo: correo.trim() };
    const perfiles = this.leerPerfiles().filter((item) => item.correo.toLowerCase() !== perfil.correo.toLowerCase());
    perfiles.push(perfil);
    localStorage.setItem(PROFILES_KEY, JSON.stringify(perfiles));
    this.guardarSesion(perfil);
  }

  cerrarSesion() {
    localStorage.removeItem(SESSION_KEY);
    this.usuarioActual = null;
  }

  private guardarSesion(usuario: SnackiUser) {
    this.usuarioActual = usuario;
    localStorage.setItem(SESSION_KEY, JSON.stringify(usuario));
  }

  private leerSesion(): SnackiUser | null {
    try {
      const valor = localStorage.getItem(SESSION_KEY);
      return valor ? (JSON.parse(valor) as SnackiUser) : null;
    } catch {
      return null;
    }
  }

  private leerPerfiles(): SnackiUser[] {
    try {
      const valor = localStorage.getItem(PROFILES_KEY);
      return valor ? (JSON.parse(valor) as SnackiUser[]) : [];
    } catch {
      return [];
    }
  }

  private nombreDesdeIdentificador(identificador: string): string {
    const nombre = identificador.includes('@') ? identificador.split('@')[0] : identificador;
    return this.formatearNombre(nombre.replace(/[._-]+/g, ' '));
  }

  private formatearNombre(nombre: string): string {
    return nombre
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((parte) => parte.charAt(0).toLocaleUpperCase('es') + parte.slice(1))
      .join(' ');
  }
}
