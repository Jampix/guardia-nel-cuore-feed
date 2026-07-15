import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
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
    // TODO(auth): POST /feedback richiede il JWT Cognito. L'invio reale
    // (service.create(...)) si attiverà con lo slice "auth".
    this.snack.open(
      'Proposta pronta! L’invio sarà attivo con l’accesso (in arrivo).',
      'OK',
      { duration: 4000 },
    );
  }
}
