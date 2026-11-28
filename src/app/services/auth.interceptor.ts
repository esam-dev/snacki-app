import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { TokenStorageService } from './token-storage.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Attach token only to our API requests
  if (!req.url.includes('/api/')) {
    return next(req);
  }

  const tokenStorage = inject(TokenStorageService);
  return from(tokenStorage.getToken()).pipe(
    switchMap((token) => {
      if (!token) return next(req);
      const authReq = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` },
      });
      return next(authReq);
    }),
  );
};
