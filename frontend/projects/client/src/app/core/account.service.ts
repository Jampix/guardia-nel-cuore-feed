import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Operazioni sull'account del cittadino. */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Cancella account e tutti i dati collegati (irreversibile). Richiede JWT. */
  deleteAccount(): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.api}/account`);
  }
}
