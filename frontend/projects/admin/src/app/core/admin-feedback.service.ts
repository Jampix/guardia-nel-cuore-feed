import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Feedback } from 'shared';
import { environment } from '../../environments/environment';

/** Accesso ai feedback per il backoffice (tutti, anche privati). */
@Injectable({ providedIn: 'root' })
export class AdminFeedbackService {
  private readonly http = inject(HttpClient);
  private readonly api = environment.apiUrl;

  /** Tutti i feedback (richiede JWT staff: aggiunto dall'interceptor). */
  getAll(): Observable<Feedback[]> {
    return this.http.get<Feedback[]>(`${this.api}/admin/feedback`);
  }
}
