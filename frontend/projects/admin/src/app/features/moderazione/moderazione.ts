import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Feedback, FeedbackStatus, FEEDBACK_STATUS_LABEL, Visibility } from 'shared';
import { AdminFeedbackService } from '../../core/admin-feedback.service';

const STATUSES: FeedbackStatus[] = ['proposta', 'in_valutazione', 'in_lavorazione', 'risolto', 'archiviato'];

/** Moderazione di un feedback: cambio stato, nota interna, risposta pubblica. */
@Component({
  selector: 'app-moderazione',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
  ],
  templateUrl: './moderazione.html',
  styleUrl: './moderazione.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Moderazione {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(AdminFeedbackService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly id = input.required<string>();

  private readonly all = toSignal(this.service.getAll(), { initialValue: [] as Feedback[] });
  readonly feedback = computed(() => this.all().find((f) => f.id === this.id()));

  readonly statuses = STATUSES;
  readonly statusLabel = FEEDBACK_STATUS_LABEL;
  readonly saving = signal(false);

  /** Visibilità gestita a parte (slide-toggle booleano): true = pubblico. */
  readonly pubblico = signal(false);

  readonly form = this.fb.nonNullable.group({
    stato: ['proposta' as FeedbackStatus],
    rispostaPubblica: [''],
    notaInterna: [''],
  });

  private patched = false;

  constructor() {
    // Precompila il form una sola volta, quando il feedback è caricato.
    effect(() => {
      const f = this.feedback();
      if (f && !this.patched) {
        this.patched = true;
        this.pubblico.set(f.visibilita === 'pubblico');
        this.form.patchValue({
          stato: f.stato,
          rispostaPubblica: f.rispostaPubblica ?? '',
          notaInterna: f.notaInterna ?? '',
        });
      }
    });
  }

  statusClass(s: FeedbackStatus): string {
    return `st-${s}`;
  }

  save(): void {
    this.saving.set(true);
    const patch = {
      ...this.form.getRawValue(),
      visibilita: (this.pubblico() ? 'pubblico' : 'privato') as Visibility,
    };
    this.service.update(this.id(), patch).subscribe({
      next: () => {
        this.snack.open('Modifiche salvate.', 'OK', { duration: 3000 });
        this.router.navigate(['/feedback']);
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Salvataggio non riuscito. Riprova.', 'OK', { duration: 4000 });
      },
    });
  }
}
