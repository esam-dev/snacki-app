import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, TipoCuenta } from './auth.service';

/** Separación de UX de la demo, no una medida de seguridad. */
export const roleGuard = (tipo: TipoCuenta): CanActivateFn => (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.currentUser?.tipo === tipo
    ? true
    : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
