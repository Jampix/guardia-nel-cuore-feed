import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Protegge le rotte private. Verifica la sessione reale (getIdToken) così
 * funziona anche al refresh diretto, quando il signal non è ancora idratato.
 * Se non autenticato reindirizza a /accedi con il returnUrl.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = await auth.getIdToken();
  if (token) return true;

  return router.createUrlTree(['/accedi'], {
    queryParams: { returnUrl: state.url },
  });
};
