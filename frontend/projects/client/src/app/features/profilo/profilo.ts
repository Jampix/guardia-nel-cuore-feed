import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from 'shared';
import { AccountService } from '../../core/account.service';

/** Profilo del cittadino: dati account, logout, cancellazione account (GDPR). */
@Component({
  selector: 'app-profilo',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './profilo.html',
  styleUrl: './profilo.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profilo {
  private readonly auth = inject(AuthService);
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);

  readonly user = this.auth.user;
  readonly deleting = signal(false);

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }

  async deleteAccount(): Promise<void> {
    const ok = confirm(
      'Eliminare definitivamente il tuo account? Verranno rimossi il profilo, le tue proposte, le foto e i tuoi voti. L\'operazione è irreversibile.',
    );
    if (!ok) return;
    this.deleting.set(true);
    this.account.deleteAccount().subscribe({
      next: async () => {
        await this.auth.logout();
        this.snack.open('Account eliminato.', 'OK', { duration: 4000 });
        this.router.navigate(['/accedi']);
      },
      error: () => {
        this.deleting.set(false);
        this.snack.open('Eliminazione non riuscita. Riprova.', 'OK', { duration: 4000 });
      },
    });
  }
}
