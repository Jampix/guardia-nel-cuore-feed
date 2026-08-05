import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Cittadino registrato in attesa di approvazione. */
export interface PendingUser {
  username: string;
  email: string;
  /** Nome pubblico mostrato in bacheca. */
  nickname: string;
  /** Nome, cognome e rapporto col paese: vuoti per chi si è iscritto prima che
   *  venissero richiesti, quindi l'interfaccia deve reggerne l'assenza. */
  nome?: string;
  cognome?: string;
  tipoUtente?: string;
  createdAt?: string;
}

/** Etichette del rapporto col paese (i valori tecnici stanno in Cognito). */
export const TIPO_UTENTE_LABEL: Record<string, string> = {
  residente: 'Residente',
  non_residente: 'Non residente',
  sostenitore: 'Sostenitore',
  turista: 'Turista',
};

/** Cittadino attivo (approvato). */
export interface Citizen extends PendingUser {
  enabled: boolean;
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

  /** Cittadini attivi (approvati). */
  getCitizens(): Observable<Citizen[]> {
    return this.http.get<Citizen[]>(`${this.api}/admin/users`);
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
