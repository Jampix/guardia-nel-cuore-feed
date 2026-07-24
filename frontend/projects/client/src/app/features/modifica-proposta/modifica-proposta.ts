import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category, Feedback } from 'shared';
import { FeedbackService } from '../../core/feedback.service';

/** Modifica di una propria proposta (solo testo, e solo se ancora privata). */
@Component({
  selector: 'app-modifica-proposta',
  imports: [
    ReactiveFormsModule, RouterLink,
    MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule,
  ],
  templateUrl: './modifica-proposta.html',
  styleUrl: './modifica-proposta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModificaProposta {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly id = input.required<string>();

  readonly categories = toSignal(this.service.getCategories(), { initialValue: [] as Category[] });
  private readonly mine = toSignal(this.service.getMine(), { initialValue: [] as Feedback[] });
  readonly feedback = computed(() => this.mine().find((f) => f.id === this.id()));
  /** Modificabile solo se privata; se pubblicata mostriamo un avviso. */
  readonly editable = computed(() => this.feedback()?.visibilita === 'privato');

  readonly saving = signal(false);
  private prefilled = false;

  readonly form = this.fb.nonNullable.group({
    titolo: ['', [Validators.required, Validators.minLength(5)]],
    categoriaId: ['', Validators.required],
    descrizione: ['', [Validators.required, Validators.minLength(10)]],
    luogo: [''],
  });

  constructor() {
    effect(() => {
      const f = this.feedback();
      if (f && !this.prefilled) {
        this.prefilled = true;
        this.form.patchValue({
          titolo: f.titolo,
          categoriaId: f.categoriaId,
          descrizione: f.descrizione,
          luogo: f.luogo ?? '',
        });
      }
    });
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.saving.set(true);
    const { titolo, descrizione, categoriaId, luogo } = this.form.getRawValue();
    this.service.updateOwn(this.id(), { titolo, descrizione, categoriaId, luogo: luogo || undefined }).subscribe({
      next: () => {
        this.snack.open('Proposta aggiornata.', 'OK', { duration: 3000 });
        this.router.navigate(['/feedback', this.id()]);
      },
      error: () => {
        this.saving.set(false);
        this.snack.open('Modifica non riuscita.', 'OK', { duration: 4000 });
      },
    });
  }
}
