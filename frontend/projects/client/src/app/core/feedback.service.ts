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

  /** Crea un feedback (richiede JWT: aggiunto dall'auth interceptor). */
  create(input: CreateFeedbackInput): Observable<Feedback> {
    return this.http.post<Feedback>(`${this.api}/feedback`, input);
  }
}
