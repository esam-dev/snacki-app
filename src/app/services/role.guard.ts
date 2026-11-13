import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, TipoCuenta } from './auth.service';

/** Guard de navegación para separar las dos experiencias locales de la demo. */
export const roleGuard = (tipo: TipoCuenta): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.currentUser?.tipo === tipo ? true : router.parseUrl('/login');
};
