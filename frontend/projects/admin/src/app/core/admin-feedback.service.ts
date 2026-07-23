import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { Feedback, FeedbackStatus, Visibility } from 'shared';
import { environment } from '../../environments/environment';

/** Campi modificabili dalla moderazione. */
export interface FeedbackPatch {
  stato?: FeedbackStatus;
  visibilita?: Visibility;
  rispostaPubblica?: string;
  notaInterna?: string;
}

/** Accesso ai feedback per il backoffice (tutti, anche privati). */
@Injectable({ providedIn: 'root' })
export class AdminFeedbackService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Tutti i feedback (richiede JWT staff: aggiunto dall'interceptor). */
  getAll(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.api}/admin/feedback`);
  }

  /** Un feedback per id (riusa la lista completa; nessun endpoint dedicato). */
  getById(id: string): Observable<Feedback | undefined> {
    return this.getAll().pipe(map((list) => list.find((f) => f.id === id)));
  }

  /** Moderazione: aggiorna stato / risposta pubblica / nota interna. */
  update(id: string, patch: FeedbackPatch): Observable<Feedback> {
    return this.http.patch<Feedback>(`${this.api}/admin/feedback/${id}`, patch);
  }
}
