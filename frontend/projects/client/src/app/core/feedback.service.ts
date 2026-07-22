import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Category, CreateFeedbackInput, Feedback } from 'shared';
import { environment } from '../../environments/environment';

/**
 * Accesso ai dati dei feedback per l'app cittadini (HTTP API reale).
 *
 * API base (prod): {@link environment.apiUrl}
 *  - GET /categories       → categorie attive (pubblica)
 *  - GET /feedback/public  → bacheca pubblica (pubblica)
 *  - POST /feedback        → crea feedback (autenticata, non usata qui)
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Categorie attive per i filtri. */
  getCategories(): Observable<Category[]> {
    return this.http.get<Category[]>(`${this.api}/categories`);
  }

  /** Feedback della bacheca pubblica (più recenti prima). */
  getPublicFeedbacks(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.api}/feedback/public`);
  }

  /** Le proposte dell'utente autenticato (anche private). */
  getMine(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.api}/feedback/mine`);
  }

  /** Crea un feedback (richiede JWT: aggiunto dall'auth interceptor). */
  create(input: CreateFeedbackInput): Observable<Feedback> {
    return this.http.post<Feedback>(`${this.api}/feedback`, input);
  }

  /** Ottiene un URL prefirmato per caricare una foto (richiede JWT). */
  presignUpload(contentType: string): Observable<{ uploadUrl: string; key: string }> {
    return this.http.post<{ uploadUrl: string; key: string }>(
      `${this.api}/uploads/presign`,
      { contentType },
    );
  }

  /**
   * Carica il file su S3 con il PUT prefirmato. L'URL NON è verso la nostra
   * API, quindi l'interceptor non vi allega alcun token (corretto per S3).
   * Il Content-Type deve combaciare con quello firmato.
   */
  uploadToS3(url: string, file: File): Observable<unknown> {
    return this.http.put(url, file, { headers: { 'Content-Type': file.type } });
  }

  /** Stato del voto dell'utente corrente su un feedback (richiede JWT). */
  getVoteStatus(id: string): Observable<{ voted: boolean }> {
    return this.http.get<{ voted: boolean }>(`${this.api}/feedback/${id}/vote`);
  }

  /** Sostieni un feedback (richiede JWT). */
  vote(id: string): Observable<{ voted: boolean; numeroVoti?: number }> {
    return this.http.post<{ voted: boolean; numeroVoti?: number }>(`${this.api}/feedback/${id}/vote`, {});
  }

  /** Ritira il sostegno (richiede JWT). */
  unvote(id: string): Observable<{ voted: boolean; numeroVoti?: number }> {
    return this.http.delete<{ voted: boolean; numeroVoti?: number }>(`${this.api}/feedback/${id}/vote`);
  }
}
