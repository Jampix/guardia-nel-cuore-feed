import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService, Category, Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL } from 'shared';
import { FeedbackService } from '../../core/feedback.service';

/** Dettaglio di un singolo feedback (raggiunto dalla bacheca). */
@Component({
  selector: 'app-feedback-detail',
  imports: [RouterLink, MatIconModule, MatButtonModule],
  templateUrl: './feedback-detail.html',
  styleUrl: './feedback-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FeedbackDetail {
  private readonly service = inject(FeedbackService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** Id del feedback dalla rotta `feedback/:id` (component input binding). */
  readonly id = input.required<string>();

  private readonly allFeedbacks = toSignal(this.service.getPublicFeedbacks(), { initialValue: [] as Feedback[] });
  private readonly categories = toSignal(this.service.getCategories(), { initialValue: [] as Category[] });

  /** Feedback corrente (undefined finché non caricato o se non trovato). */
  readonly feedback = computed(() => this.allFeedbacks().find((f) => f.id === this.id()));

  /** Stato voto (mantenuto separato per aggiornare al volo il pulsante/contatore). */
  readonly voted = signal(false);
  readonly voteCount = signal(0);
  readonly voting = signal(false);
  readonly isAuthenticated = this.auth.isAuthenticated;

  constructor() {
    let synced = false;
    effect(() => {
      const f = this.feedback();
      if (!f) return;
      if (!synced) {
        synced = true;
        this.voteCount.set(f.numeroVoti);
      }
      // Se autenticato, recupera se l'utente ha già votato.
      if (this.isAuthenticated()) {
        this.service.getVoteStatus(f.id).subscribe((r) => this.voted.set(r.voted));
      }
    });
  }

  toggleVote(): void {
    const f = this.feedback();
    if (!f || this.voting()) return;
    if (!this.isAuthenticated()) {
      this.router.navigate(['/accedi'], { queryParams: { returnUrl: `/feedback/${f.id}` } });
      return;
    }
    this.voting.set(true);
    const op = this.voted() ? this.service.unvote(f.id) : this.service.vote(f.id);
    op.subscribe({
      next: (r) => {
        this.voted.set(r.voted);
        if (r.numeroVoti !== undefined) this.voteCount.set(r.numeroVoti);
        this.voting.set(false);
      },
      error: () => this.voting.set(false),
    });
  }

  readonly statusLabel = FEEDBACK_STATUS_LABEL;

  categoryName(id: string): string {
    return this.categories().find((c) => c.id === id)?.nome ?? id;
  }

  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }

  categoryGradient(id: string): string {
    const map: Record<string, string> = {
      strade: 'linear-gradient(135deg, #9c6b4f, #6b4433)',
      verde: 'linear-gradient(135deg, #7c8a5a, #4d5a34)',
      illuminazione: 'linear-gradient(135deg, #c98a3c, #8a5a20)',
      rifiuti: 'linear-gradient(135deg, #5a8a7c, #345a4d)',
      sicurezza: 'linear-gradient(135deg, #8a6a9c, #5a3f6b)',
      cultura: 'linear-gradient(135deg, #b06a6a, #7a3f3f)',
    };
    return map[id] ?? 'linear-gradient(135deg, #9a8e88, #6e615b)';
  }

  /** Etichetta temporale relativa in italiano (es. "3 giorni fa"). */
  timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 60) return mins <= 1 ? 'poco fa' : `${mins} minuti fa`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours === 1 ? "1 ora fa" : `${hours} ore fa`;
    const days = Math.round(hours / 24);
    if (days < 30) return days === 1 ? 'ieri' : `${days} giorni fa`;
    const months = Math.round(days / 30);
    return months === 1 ? '1 mese fa' : `${months} mesi fa`;
  }
}
