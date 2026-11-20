import { Injectable } from '@angular/core';
import { emptyRecord, readJson, writeJson } from './demo-storage';

export interface SnackiUser {
  id: string;
  nombre: string;
  correo: string;
  tipo: 'cliente' | 'comercio';
  comercioId?: string;
}

export type TipoCuenta = SnackiUser['tipo'];

/** Perfil persistido: añade credenciales demo al usuario público de la sesión. */
interface PerfilDemo extends SnackiUser {
  passwordHash: string;
  salt: string;
}

const SESSION_KEY = 'snacki.current-user';
const PROFILES_KEY = 'snacki.profiles';
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

/**
 * Hash SOLO de demostración: FNV-1a de 32 bits con salt.
 * NO es criptográfico; en producción usar Argon2/bcrypt en el servidor.
 */
function hashDemo(password: string, salt: string): string {
  let hash = FNV_OFFSET;
  const entrada = `${salt}:${password}`;
  for (let i = 0; i < entrada.length; i++) {
    hash ^= entrada.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Sesión local de demostración. La autenticación real requiere un backend. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private usuarioActual: SnackiUser | null = this.leerSesion();

  get currentUser(): SnackiUser | null {
    return this.usuarioActual;
  }

  iniciarSesion(identificador: string, password: string, tipo: TipoCuenta = 'cliente'): boolean {
    const valor = identificador.trim();
    const clave = password.trim();
    if (!valor || !clave) return false;

    const perfiles = this.leerPerfiles();
    const perfilGuardado = perfiles.find((perfil) =>
      perfil.correo.toLowerCase() === valor.toLowerCase() || perfil.nombre.toLowerCase() === valor.toLowerCase(),
    );

    if (perfilGuardado && perfilGuardado.tipo !== tipo) return false;
    if (tipo === 'comercio' && !perfilGuardado?.comercioId) return false;

    if (perfilGuardado) {
      if (perfilGuardado.passwordHash && perfilGuardado.salt) {
        if (hashDemo(clave, perfilGuardado.salt) !== perfilGuardado.passwordHash) return false;
      }
      // Migración demo: los perfiles legacy sin passwordHash se aceptan sin verificar;
      // el hash se generará cuando el usuario vuelva a registrarse.
      return this.guardarSesion(this.aUsuario(perfilGuardado));
    }

    // Demo aislada: si no hay perfil, no reutilizamos el correo tecleado (podría ser
    // ajeno o coincidir con datos locales de otra cuenta). Un id nuevo mantiene el
    // flujo de prueba sin reclamar una identidad registrada ni mezclar wallets.
    const usuarioDemo: SnackiUser = {
      id: this.nuevoId(),
      nombre: this.nombreDesdeIdentificador(valor),
      correo: '',
      tipo,
    };
    return this.guardarSesion(usuarioDemo);
  }

  registrar(nombre: string, correo: string, password: string, tipo: TipoCuenta = 'cliente', comercioId?: string): boolean {
    const nombreNormalizado = this.formatearNombre(nombre);
    const correoNormalizado = correo.trim();
    const clave = password.trim();
    const comercioNormalizado = comercioId?.trim();

    if (!nombreNormalizado || !correoNormalizado || !clave) return false;
    if (tipo === 'comercio' && !comercioNormalizado) return false;

    const perfiles = this.leerPerfiles();
    // El correo es único en toda la demo, independientemente del rol.
    if (perfiles.some((perfil) => perfil.correo.toLowerCase() === correoNormalizado.toLowerCase())) return false;

    const salt = this.nuevoSalt();
    const perfil: PerfilDemo = {
      id: this.nuevoId(),
      nombre: nombreNormalizado,
      correo: correoNormalizado,
      tipo,
      ...(tipo === 'comercio' && comercioNormalizado ? { comercioId: comercioNormalizado } : {}),
      passwordHash: hashDemo(clave, salt),
      salt,
    };

    const registro = emptyRecord<PerfilDemo>();
    for (const existente of perfiles) registro[existente.id] = existente;
    registro[perfil.id] = perfil;

    if (!writeJson(PROFILES_KEY, registro)) return false;
    return this.guardarSesion(this.aUsuario(perfil));
  }

  cerrarSesion() {
    writeJson(SESSION_KEY, null);
    this.usuarioActual = null;
  }

  private guardarSesion(usuario: SnackiUser): boolean {
    if (!writeJson(SESSION_KEY, usuario)) return false;
    this.usuarioActual = usuario;
    return true;
  }

  private aUsuario(perfil: PerfilDemo): SnackiUser {
    return {
      id: perfil.id,
      nombre: perfil.nombre,
      correo: perfil.correo,
      tipo: perfil.tipo,
      ...(perfil.comercioId ? { comercioId: perfil.comercioId } : {}),
    };
  }

  private leerSesion(): SnackiUser | null {
    const dato = readJson<unknown>(SESSION_KEY, null);
    if (!this.esObjeto(dato)) return null;

    const nombre = typeof dato['nombre'] === 'string' ? dato['nombre'].trim() : '';
    const correo = typeof dato['correo'] === 'string' ? dato['correo'].trim() : '';
    if (!nombre || typeof dato['correo'] !== 'string') return null;

    const tipo: TipoCuenta = dato['tipo'] === 'comercio' ? 'comercio' : 'cliente';
    const comercioId = typeof dato['comercioId'] === 'string' ? dato['comercioId'].trim() : '';
    if (tipo === 'comercio' && !comercioId) return null;

    const idGuardado = typeof dato['id'] === 'string' && dato['id'].trim() ? dato['id'].trim() : '';
    const usuario: SnackiUser = {
      id: idGuardado || this.nuevoId(),
      nombre,
      correo,
      tipo,
      ...(comercioId ? { comercioId } : {}),
    };
    // Las sesiones legacy no tenían id: lo persistimos para que la wallet no cambie
    // de clave en cada recarga y la migración de saldos pueda encontrarla.
    if (!idGuardado) writeJson(SESSION_KEY, usuario);
    return usuario;
  }

  private leerPerfiles(): PerfilDemo[] {
    const dato = readJson<unknown>(PROFILES_KEY, []);
    const entradas: unknown[] = Array.isArray(dato)
      ? dato
      : this.esObjeto(dato)
        ? Object.values(dato)
        : [];

    const perfiles: PerfilDemo[] = [];
    const correosVistos = new Set<string>();
    for (const entrada of entradas) {
      const perfil = this.normalizarPerfil(entrada);
      if (!perfil) continue;
      const correo = perfil.correo.toLowerCase();
      if (correosVistos.has(correo)) continue;
      correosVistos.add(correo);
      perfiles.push(perfil);
    }
    return perfiles;
  }

  private normalizarPerfil(entrada: unknown): PerfilDemo | null {
    if (!this.esObjeto(entrada)) return null;

    const nombre = typeof entrada['nombre'] === 'string' ? entrada['nombre'].trim() : '';
    const correo = typeof entrada['correo'] === 'string' ? entrada['correo'].trim() : '';
    if (!nombre || !correo) return null;

    const passwordHash = typeof entrada['passwordHash'] === 'string' ? entrada['passwordHash'] : '';
    const salt = typeof entrada['salt'] === 'string' ? entrada['salt'] : '';
    const credenciales = passwordHash && salt ? { passwordHash, salt } : { passwordHash: '', salt: '' };
    const comercioId = typeof entrada['comercioId'] === 'string' ? entrada['comercioId'].trim() : '';

    return {
      id: typeof entrada['id'] === 'string' && entrada['id'].trim() ? entrada['id'] : this.nuevoId(),
      nombre,
      correo,
      tipo: entrada['tipo'] === 'comercio' ? 'comercio' : 'cliente',
      ...(comercioId ? { comercioId } : {}),
      ...credenciales,
    };
  }

  private esObjeto(valor: unknown): valor is Record<string, unknown> {
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
  }

  private nuevoId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  private nuevoSalt(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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
