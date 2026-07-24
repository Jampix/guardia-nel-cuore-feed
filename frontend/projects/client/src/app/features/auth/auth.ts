import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'shared';
import { RegolamentoDialog } from '../regolamento/regolamento-dialog';

type Mode = 'login' | 'register' | 'confirm';

// min 8, con minuscola, maiuscola e cifra (allineato alla password policy Cognito).
const PWD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

/** Accesso / registrazione / conferma codice (mode da rotta). */
@Component({
  selector: 'app-auth',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
  ],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Auth {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  /** login | register | confirm — dai `data` della rotta (component input binding). */
  readonly mode = input<Mode>('login');
  /** Email pre-compilata per la conferma (query param). */
  readonly email = input<string>('');
  /** URL a cui tornare dopo il login (query param). */
  readonly returnUrl = input<string>('');
  /** '1' subito dopo una registrazione completata (avviso approvazione). */
  readonly registrato = input<string>('');

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showRegistered = computed(() => this.registrato() === '1' && !this.error());

  readonly title = computed(() => {
    switch (this.mode()) {
      case 'register': return 'Crea un account';
      case 'confirm': return 'Conferma la tua email';
      default: return 'Accedi';
    }
  });

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly registerForm = this.fb.nonNullable.group({
    nickname: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.pattern(PWD_PATTERN)]],
    consenso: [false, Validators.requiredTrue],
  });
  readonly confirmForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    code: ['', [Validators.required, Validators.minLength(6)]],
  });

  private regDialogShown = false;

  constructor() {
    // Precompila l'email nella conferma quando arriva dal query param.
    effect(() => {
      const e = this.email();
      if (e) this.confirmForm.patchValue({ email: e });
    });

    // In registrazione mostra subito il regolamento: va accettato per proseguire.
    effect(() => {
      if (this.mode() === 'register' && !this.regDialogShown) {
        this.regDialogShown = true;
        this.dialog.open(RegolamentoDialog, { data: { mode: 'full' }, disableClose: true, maxWidth: '92vw' })
          .afterClosed().subscribe((accepted) => {
            if (accepted) this.registerForm.controls.consenso.setValue(true);
            else this.router.navigate(['/accedi']);
          });
      }
    });
  }

  async doLogin(): Promise<void> {
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    await this.run(async () => {
      const { email, password } = this.loginForm.getRawValue();
      const res = await this.auth.login(email, password);
      if (res.isSignedIn) {
        this.router.navigateByUrl(this.returnUrl() || '/');
      } else {
        this.router.navigate(['/conferma'], { queryParams: { email } });
      }
    }, (e) => {
      if (e?.name === 'UserNotConfirmedException') {
        this.router.navigate(['/conferma'], { queryParams: { email: this.loginForm.getRawValue().email } });
        return true; // gestito, niente messaggio d'errore
      }
      return false;
    });
  }

  async doRegister(): Promise<void> {
    if (this.registerForm.invalid) { this.registerForm.markAllAsTouched(); return; }
    await this.run(async () => {
      const { email, password, nickname } = this.registerForm.getRawValue();
      await this.auth.register(email, password, nickname);
      this.snack.open('Ti abbiamo inviato un codice via email.', 'OK', { duration: 4000 });
      this.router.navigate(['/conferma'], { queryParams: { email } });
    });
  }

  async doConfirm(): Promise<void> {
    if (this.confirmForm.invalid) { this.confirmForm.markAllAsTouched(); return; }
    await this.run(async () => {
      const { email, code } = this.confirmForm.getRawValue();
      await this.auth.confirm(email, code);
      this.snack.open('Registrazione completata!', 'OK', { duration: 4000 });
      this.router.navigate(['/accedi'], { queryParams: { registrato: 1 } });
    });
  }

  async resend(): Promise<void> {
    await this.run(async () => {
      await this.auth.resendCode(this.confirmForm.getRawValue().email);
      this.snack.open('Codice reinviato.', 'OK', { duration: 3000 });
    });
  }

  /** Wrapper: gestisce loading/errore in modo uniforme. */
  private async run(action: () => Promise<void>, onError?: (e: any) => boolean): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (e: any) {
      if (onError && onError(e)) return;
      this.error.set(this.humanError(e));
    } finally {
      this.loading.set(false);
    }
  }

  private humanError(e: any): string {
    // Blocco dal trigger Pre-Authentication (cittadino non ancora approvato).
    const msg = String(e?.message ?? '');
    if (e?.name === 'UserLambdaValidationException' || /approvazione/i.test(msg)) {
      return 'Il tuo account è in attesa di approvazione da parte dello staff.';
    }
    const map: Record<string, string> = {
      NotAuthorizedException: 'Email o password non corretti.',
      UserNotFoundException: 'Nessun account con questa email.',
      UsernameExistsException: 'Esiste già un account con questa email.',
      CodeMismatchException: 'Codice non corretto.',
      ExpiredCodeException: 'Codice scaduto: richiedine uno nuovo.',
      InvalidPasswordException: 'Password troppo debole.',
      LimitExceededException: 'Troppi tentativi: riprova tra poco.',
    };
    return map[e?.name] ?? 'Qualcosa è andato storto. Riprova.';
  }
}
