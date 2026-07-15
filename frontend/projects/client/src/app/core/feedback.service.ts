import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Category, Feedback } from 'shared';

/**
 * Accesso ai dati dei feedback per l'app cittadini.
 *
 * ⚠️ MOCK: al momento restituisce dati statici. L'HTTP API deployata espone
 * solo `GET /categories` e `POST /feedback`; l'endpoint della bacheca
 * `GET /feedback/public` va ancora aggiunto nel backend. Quando ci sarà,
 * questi metodi passeranno a `HttpClient` (base URL da environment).
 *
 * API base (prod): https://dex1zyd5pe.execute-api.eu-west-1.amazonaws.com
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly categories: Category[] = [
    { id: 'strade', nome: 'Strade', attiva: true },
    { id: 'verde', nome: 'Verde pubblico', attiva: true },
    { id: 'illuminazione', nome: 'Illuminazione', attiva: true },
    { id: 'rifiuti', nome: 'Rifiuti', attiva: true },
    { id: 'sicurezza', nome: 'Sicurezza', attiva: true },
    { id: 'cultura', nome: 'Cultura', attiva: true },
  ];

  private readonly feedbacks: Feedback[] = [
    {
      id: 'f1',
      titolo: 'Area giochi al parco comunale',
      descrizione: 'Nuovi giochi e panchine all\'ombra per le famiglie del centro.',
      categoriaId: 'verde',
      stato: 'in_valutazione',
      visibilita: 'pubblico',
      luogo: 'Parco comunale',
      numeroVoti: 41,
      autoreId: 'u2',
      autoreNick: 'Chiara V.',
      lingua: 'it',
      createdAt: '2026-07-12T09:20:00Z',
      updatedAt: '2026-07-13T10:00:00Z',
    },
    {
      id: 'f2',
      titolo: 'Buche lungo via Roma',
      descrizione: 'Il tratto davanti alla scuola è pieno di buche profonde: pericoloso per i pedoni.',
      categoriaId: 'strade',
      stato: 'in_lavorazione',
      visibilita: 'pubblico',
      luogo: 'Via Roma',
      numeroVoti: 24,
      autoreId: 'u1',
      autoreNick: 'Marco P.',
      lingua: 'it',
      createdAt: '2026-07-11T14:05:00Z',
      updatedAt: '2026-07-12T08:30:00Z',
    },
    {
      id: 'f3',
      titolo: 'Illuminazione lungomare',
      descrizione: 'Il tratto verso il porto è al buio dopo le 21: chiediamo nuovi punti luce a LED.',
      categoriaId: 'illuminazione',
      stato: 'proposta',
      visibilita: 'pubblico',
      luogo: 'Lungomare',
      numeroVoti: 41,
      autoreId: 'u3',
      autoreNick: 'Anna R.',
      lingua: 'it',
      createdAt: '2026-07-14T18:40:00Z',
      updatedAt: '2026-07-14T18:40:00Z',
    },
    {
      id: 'f4',
      titolo: 'Raccolta differenziata nel centro storico',
      descrizione: 'Nuove isole ecologiche nei vicoli dove non passa il mezzo grande.',
      categoriaId: 'rifiuti',
      stato: 'risolto',
      visibilita: 'pubblico',
      luogo: 'Centro storico',
      numeroVoti: 33,
      autoreId: 'u4',
      autoreNick: 'Giulia T.',
      lingua: 'it',
      createdAt: '2026-07-02T11:00:00Z',
      updatedAt: '2026-07-09T16:20:00Z',
    },
  ];

  /** Categorie attive per i filtri. TODO: GET /categories. */
  getCategories(): Observable<Category[]> {
    return of(this.categories.filter((c) => c.attiva));
  }

  /** Feedback della bacheca pubblica. TODO: GET /feedback/public. */
  getPublicFeedbacks(): Observable<Feedback[]> {
    return of(this.feedbacks);
  }
}
