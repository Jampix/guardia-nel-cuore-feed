import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService, Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL } from 'shared';
import { AdminFeedbackService } from '../../core/admin-feedback.service';

/** Dashboard di sintesi del backoffice: KPI + coda di moderazione (dati reali). */
@Component({
  selector: 'app-sintesi',
  imports: [RouterLink],
  templateUrl: './sintesi.html',
  styleUrl: './sintesi.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sintesi {
  private readonly auth = inject(AuthService);
  private readonly service = inject(AdminFeedbackService);

  readonly user = this.auth.user;
  private readonly feedbacks = toSignal(this.service.getAll(), { initialValue: [] as Feedback[] });

  readonly daModerare = computed(() => this.feedbacks().filter((f) => f.stato === 'proposta').length);
  readonly inLavorazione = computed(() => this.feedbacks().filter((f) => f.stato === 'in_lavorazione').length);
  readonly risoltiMese = computed(() => {
    const now = new Date();
    return this.feedbacks().filter((f) => {
      if (f.stato !== 'risolto') return false;
      const d = new Date(f.updatedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  });
  readonly cittadini = computed(() => new Set(this.feedbacks().map((f) => f.autoreId)).size);
  readonly segnalati = computed(() => this.feedbacks().filter((f) => (f.segnalazioni ?? 0) > 0).length);

  /** Coda: proposte nuove e in valutazione, dalla più recente. */
  readonly coda = computed(() =>
    this.feedbacks()
      .filter((f) => f.stato === 'proposta' || f.stato === 'in_valutazione')
      .slice(0, 6),
  );

  readonly statusLabel = FEEDBACK_STATUS_LABEL;
  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }
}
