import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL } from 'shared';
import { AdminFeedbackService } from '../../core/admin-feedback.service';

const STATUSES: FeedbackStatus[] = ['proposta', 'in_valutazione', 'in_lavorazione', 'risolto', 'archiviato'];

/** Elenco di tutti i feedback (backoffice), filtrabile per stato. */
@Component({
  selector: 'app-feedback-list',
  imports: [RouterLink, MatChipsModule, MatIconModule],
  templateUrl: './feedback-list.html',
  styleUrl: './feedback-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackList {
  private readonly service = inject(AdminFeedbackService);

  private readonly all = toSignal(this.service.getAll(), { initialValue: [] as Feedback[] });
  readonly statusFilter = signal<FeedbackStatus | null>(null);
  readonly statuses = STATUSES;
  readonly statusLabel = FEEDBACK_STATUS_LABEL;

  readonly feedbacks = computed(() => {
    const s = this.statusFilter();
    const all = this.all();
    return s ? all.filter((f) => f.stato === s) : all;
  });

  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }

  setFilter(s: FeedbackStatus | null): void {
    this.statusFilter.set(s);
  }
}
