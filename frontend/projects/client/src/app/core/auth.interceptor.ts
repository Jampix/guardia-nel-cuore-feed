import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap } from 'rxjs';
import { AuthService } from 'shared';
import { environment } from '../../environments/environment';

/**
 * Allega l'id token (JWT Cognito) alle chiamate verso la nostra HTTP API.
 * Gli endpoint pubblici (categories, feedback/public) ignorano l'header;
 * quelli protetti (es. POST /feedback) lo usano. Se non c'è sessione, la
 * richiesta parte senza token.
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
