import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { RouterLink } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL, Loading } from 'shared';
import { AdminFeedbackService } from '../../core/admin-feedback.service';

const STATUSES: FeedbackStatus[] = ['proposta', 'in_valutazione', 'in_lavorazione', 'risolto', 'archiviato'];

/** Asse visibilità, indipendente dallo stato: una risolta può essere ancora privata. */
export type VisFilter = 'tutte' | 'pubbliche' | 'private';

/** Elenco di tutti i feedback (backoffice), filtrabile per stato. */
@Component({
  selector: 'app-feedback-list',
  imports: [RouterLink, MatChipsModule, MatIconModule, Loading],
  templateUrl: './feedback-list.html',
  styleUrl: './feedback-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackList {
  private readonly service = inject(AdminFeedbackService);

  /**
   * Filtri iniziali dai query param (`?vis=pubbliche|private`, `?segnalati=1`),
   * così i KPI della Sintesi aprono la lista già filtrata.
   * Arrivano come input grazie a `withComponentInputBinding()`.
   */
  readonly vis = input<string>('');
  readonly segnalati = input<string>('');

  readonly loading = signal(true);
  private readonly all = toSignal(
    this.service.getAll().pipe(finalize(() => this.loading.set(false))),
    { initialValue: [] as Feedback[] },
  );
  readonly statusFilter = signal<FeedbackStatus | null>(null);
  readonly visFilter = signal<VisFilter>('tutte');
  readonly onlyReported = signal(false);
  readonly statuses = STATUSES;
  readonly statusLabel = FEEDBACK_STATUS_LABEL;

  /** Quante proposte hanno almeno una segnalazione (per il filtro/contatore). */
  readonly reportedCount = computed(() => this.all().filter((f) => (f.segnalazioni ?? 0) > 0).length);

  /** Conteggi per visibilità: mostrati sui filtri, così il numero si vede subito. */
  readonly publicCount = computed(() => this.all().filter((f) => f.visibilita === 'pubblico').length);
  readonly privateCount = computed(() => this.all().filter((f) => f.visibilita !== 'pubblico').length);

  readonly feedbacks = computed(() => {
    const s = this.statusFilter();
    let list = s ? this.all().filter((f) => f.stato === s) : this.all();
    const v = this.visFilter();
    if (v !== 'tutte') {
      const wantPublic = v === 'pubbliche';
      list = list.filter((f) => (f.visibilita === 'pubblico') === wantPublic);
    }
    if (this.onlyReported()) list = list.filter((f) => (f.segnalazioni ?? 0) > 0);
    return list;
  });

  constructor() {
    // Applica i filtri passati nell'URL dai KPI della Sintesi. L'effect dipende
    // solo dagli input: impostare i signal qui non lo fa ripartire, quindi non
    // sovrascrive le scelte fatte poi a mano dall'utente.
    effect(() => {
      const v = this.vis();
      if (v === 'pubbliche' || v === 'private') this.visFilter.set(v);
    });
    effect(() => {
      if (this.segnalati() === '1') this.onlyReported.set(true);
    });
  }

  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }

  setFilter(s: FeedbackStatus | null): void {
    this.statusFilter.set(s);
  }

  setVisFilter(v: VisFilter): void {
    this.visFilter.set(v);
  }

  toggleReported(): void {
    this.onlyReported.update((v) => !v);
  }
}
