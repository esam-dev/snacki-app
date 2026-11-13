import { Injectable } from '@angular/core';

export interface SnackiUser {
  nombre: string;
  correo: string;
  tipo: 'cliente' | 'comercio';
  comercioId?: string;
}

export type TipoCuenta = SnackiUser['tipo'];

const SESSION_KEY = 'snacki.current-user';
const PROFILES_KEY = 'snacki.profiles';

/** Sesión local de demostración. La autenticación real requiere un backend. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private usuarioActual: SnackiUser | null = this.leerSesion();

  get currentUser(): SnackiUser | null {
    return this.usuarioActual;
  }

  iniciarSesion(identificador: string, password: string, tipo: TipoCuenta = 'cliente'): boolean {
    const valor = identificador.trim();
    if (!valor || !password.trim()) return false;

    const perfiles = this.leerPerfiles();
    const perfilGuardado = perfiles.find((perfil) =>
      perfil.correo.toLowerCase() === valor.toLowerCase() || perfil.nombre.toLowerCase() === valor.toLowerCase(),
    );
    if (perfilGuardado && perfilGuardado.tipo !== tipo) return false;
    if (tipo === 'comercio' && (!perfilGuardado?.comercioId)) return false;
    const nombre = perfilGuardado?.nombre ?? this.nombreDesdeIdentificador(valor);
    const correo = perfilGuardado?.correo ?? (valor.includes('@') ? valor : '');

    this.guardarSesion({ nombre, correo, tipo, ...(tipo === 'comercio' && perfilGuardado?.comercioId ? { comercioId: perfilGuardado.comercioId } : {}) });
    return true;
  }

  registrar(nombre: string, correo: string, tipo: TipoCuenta = 'cliente', comercioId?: string) {
    const perfil: SnackiUser = {
      nombre: this.formatearNombre(nombre),
      correo: correo.trim(),
      tipo,
      ...(tipo === 'comercio' && comercioId ? { comercioId } : {}),
    };
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
      if (!valor) return null;
      const user = JSON.parse(valor) as Partial<SnackiUser>;
      if (!user.nombre || !user.correo) return null;
      return { nombre: user.nombre, correo: user.correo, tipo: user.tipo === 'comercio' ? 'comercio' : 'cliente', ...(user.comercioId ? { comercioId: user.comercioId } : {}) };
    } catch {
      return null;
    }
  }

  private leerPerfiles(): SnackiUser[] {
    try {
      const valor = localStorage.getItem(PROFILES_KEY);
      return valor ? (JSON.parse(valor) as Partial<SnackiUser>[]).filter((perfil): perfil is SnackiUser => !!perfil.nombre && !!perfil.correo).map((perfil) => ({
        nombre: perfil.nombre!, correo: perfil.correo!, tipo: perfil.tipo === 'comercio' ? 'comercio' : 'cliente',
        ...(perfil.comercioId ? { comercioId: perfil.comercioId } : {}),
      })) : [];
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
