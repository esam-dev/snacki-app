import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService, TipoCuenta } from './auth.service';

export const roleGuard = (tipo: TipoCuenta): CanActivateFn => async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ensureSessionResolved();

  const user = auth.currentUser;
  if (!user) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  if (user.tipo === tipo) {
    return true;
  }

  // Redirect to the correct home for the authenticated role to avoid loops/confusion
  const home = user.tipo === 'comercio' ? '/comercio' : '/tabs/home';
  return router.createUrlTree([home]);
};
