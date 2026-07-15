import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Category, Visibility } from 'shared';
import { FeedbackService } from '../../core/feedback.service';

/** Form di creazione di una nuova proposta/segnalazione del cittadino. */
@Component({
  selector: 'app-nuova-proposta',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './nuova-proposta.html',
  styleUrl: './nuova-proposta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NuovaProposta {
  private readonly fb = inject(FormBuilder);
  private readonly service = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly categories = toSignal(this.service.getCategories(), { initialValue: [] as Category[] });
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    titolo: ['', [Validators.required, Validators.minLength(5)]],
    categoriaId: ['', Validators.required],
    descrizione: ['', [Validators.required, Validators.minLength(10)]],
    luogo: [''],
    visibilita: ['pubblico' as Visibility, Validators.required],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    // La rotta è protetta dall'authGuard e l'interceptor allega il JWT:
    // qui l'utente è autenticato.
    this.submitting.set(true);
    const { titolo, descrizione, categoriaId, luogo, visibilita } = this.form.getRawValue();
    this.service
      .create({ titolo, descrizione, categoriaId, visibilita, luogo: luogo || undefined, lingua: 'it' })
      .subscribe({
        next: () => {
          this.snack.open('Proposta pubblicata! Grazie.', 'OK', { duration: 4000 });
          this.router.navigate(['/']);
        },
        error: () => {
          this.submitting.set(false);
          this.snack.open('Invio non riuscito. Riprova.', 'OK', { duration: 4000 });
        },
      });
  }
}
