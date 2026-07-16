import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { map, Observable, of, switchMap } from 'rxjs';
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

  private readonly MAX_MB = 5;
  private readonly ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
  readonly photoFile = signal<File | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly photoError = signal<string | null>(null);

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoError.set(null);
    if (!file) return;
    if (!this.ALLOWED.includes(file.type)) {
      this.photoError.set('Formato non valido: usa JPEG, PNG o WebP.');
      return;
    }
    if (file.size > this.MAX_MB * 1024 * 1024) {
      this.photoError.set(`La foto supera ${this.MAX_MB} MB.`);
      return;
    }
    this.photoFile.set(file);
    this.photoPreview.set(URL.createObjectURL(file));
  }

  removePhoto(): void {
    const url = this.photoPreview();
    if (url) URL.revokeObjectURL(url);
    this.photoFile.set(null);
    this.photoPreview.set(null);
  }

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
    const file = this.photoFile();

    // Se c'è una foto: presign → upload su S3 → uso la chiave; altrimenti nessuna.
    const key$: Observable<string | undefined> = file
      ? this.service.presignUpload(file.type).pipe(
          switchMap(({ uploadUrl, key }) =>
            this.service.uploadToS3(uploadUrl, file).pipe(map(() => key)),
          ),
        )
      : of(undefined);

    key$
      .pipe(
        switchMap((fotoKey) =>
          this.service.create({
            titolo,
            descrizione,
            categoriaId,
            visibilita,
            luogo: luogo || undefined,
            fotoKey,
            lingua: 'it',
          }),
        ),
      )
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
