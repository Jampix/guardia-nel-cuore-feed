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

  /**
   * Toglie l'accesso senza cancellare nulla: rimuove dal gruppo `cittadino`.
   * È l'operazione giusta quando una proposta è già in bacheca e altri l'hanno
   * sostenuta — farla sparire punirebbe anche loro.
   */
  revoke(username: string): Observable<{ revoked: boolean; sessioniChiuse: boolean }> {
    return this.http.post<{ revoked: boolean; sessioniChiuse: boolean }>(
      `${this.api}/admin/users/${encodeURIComponent(username)}/revoke`,
      {},
    );
  }

  /**
   * Rimozione COMPLETA: elimina l'account **e tutti i suoi dati** (proposte,
   * foto, sostegni e segnalazioni), con la stessa pulizia del diritto all'oblio.
   * Irreversibile: per il solo blocco dell'accesso usare `revoke`.
   */
  reject(username: string): Observable<void> {
    return this.http.delete<void>(`${this.api}/admin/users/${encodeURIComponent(username)}`);
  }
}
