import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from 'shared';

/**
 * Protegge il backoffice: consente l'accesso solo a chi è autenticato ED è nel
 * gruppo `admin` o `membro`. Un cittadino (o non loggato) viene reindirizzato
 * al login. Aggiorna lo stato prima del controllo (robusto al refresh diretto).
 */
export const staffGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.refresh();
  if (auth.hasGroup('admin') || auth.hasGroup('membro')) return true;

  const forbidden = auth.isAuthenticated(); // loggato ma senza ruolo staff
  return router.createUrlTree(['/accedi'], {
    queryParams: { returnUrl: state.url, ...(forbidden ? { forbidden: 1 } : {}) },
  });
};
