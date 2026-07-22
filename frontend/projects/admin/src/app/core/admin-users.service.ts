import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Cittadino registrato in attesa di approvazione. */
export interface PendingUser {
  username: string;
  email: string;
  nickname: string;
  createdAt?: string;
}

/** Gestione iscrizioni cittadini (approvazione staff). */
@Injectable({ providedIn: 'root' })
export class AdminUsersService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Iscrizioni in attesa di approvazione. */
  getPending(): Observable<PendingUser[]> {
    return this.http.get<PendingUser[]>(`${this.api}/admin/users/pending`);
  }

  /** Approva: aggiunge il cittadino al gruppo `cittadino`. */
  approve(username: string): Observable<{ approved: boolean }> {
    return this.http.post<{ approved: boolean }>(
      `${this.api}/admin/users/${encodeURIComponent(username)}/approve`,
      {},
    );
  }

  /** Rifiuta: elimina l'account non approvato. */
  reject(username: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/admin/users/${encodeURIComponent(username)}`);
  }
}
