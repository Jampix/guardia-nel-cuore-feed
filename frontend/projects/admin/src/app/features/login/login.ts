import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from 'shared';

/** Login del backoffice (solo staff: gruppo admin/membro). */
@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** '1' se reindirizzato qui perché loggato ma senza ruolo staff. */
  readonly forbidden = input('');
  readonly returnUrl = input('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showForbidden = computed(() => this.forbidden() === '1' && !this.error());

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      const res = await this.auth.login(email, password);
      if (!res.isSignedIn) {
        this.error.set('Account non ancora verificato. Contatta un amministratore.');
        return;
      }
      if (this.auth.hasGroup('admin') || this.auth.hasGroup('membro')) {
        this.router.navigateByUrl(this.returnUrl() || '/');
      } else {
        await this.auth.logout();
        this.error.set('Questo account non ha accesso al backoffice.');
      }
    } catch (e: any) {
      this.error.set(
        e?.name === 'NotAuthorizedException' ? 'Email o password non corretti.' : 'Accesso non riuscito. Riprova.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
