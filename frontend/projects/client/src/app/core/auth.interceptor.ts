import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from 'shared';
import { environment } from '../../environments/environment';

/**
 * Allega l'id token (JWT Cognito) alle chiamate verso la nostra HTTP API.
 *
 * Lo allega a TUTTE, senza elenchi di eccezioni: i contenuti stanno dietro
 * l'accesso, quindi ogni rotta dell'API è autenticata (bacheca e categorie
 * comprese). Le chiamate che non vanno verso `environment.apiUrl` — es. il PUT
 * prefirmato su S3, che con un header Authorization estraneo verrebbe
 * rifiutato — escono intatte. Se non c'è sessione la richiesta parte senza
 * token e l'API risponde 401.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);

  const auth = inject(AuthService);
  return from(auth.getIdToken()).pipe(
    switchMap((token) =>
      next(token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req),
    ),
  );
};
