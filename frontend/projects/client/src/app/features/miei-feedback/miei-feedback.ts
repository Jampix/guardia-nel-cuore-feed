import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL, Loading } from 'shared';
import { FeedbackService } from '../../core/feedback.service';

/** Le proposte del cittadino autenticato (anche private). */
@Component({
  selector: 'app-miei-feedback',
  imports: [RouterLink, MatIconModule, MatButtonModule, Loading],
  templateUrl: './miei-feedback.html',
  styleUrl: './miei-feedback.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MieiFeedback {
  private readonly service = inject(FeedbackService);

  readonly loading = signal(true);
  readonly feedbacks = toSignal(
    this.service.getMine().pipe(finalize(() => this.loading.set(false))),
    { initialValue: [] as Feedback[] },
  );
  readonly statusLabel = FEEDBACK_STATUS_LABEL;

  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }
}
