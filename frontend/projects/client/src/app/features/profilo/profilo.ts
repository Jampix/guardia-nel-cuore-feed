import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { AuthService, ConfermaDialog } from 'shared';
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
  private readonly dialog = inject(MatDialog);
  readonly deleting = signal(false);

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/']);
  }

  async deleteAccount(): Promise<void> {
    // Conferma DIGITATA: è l'azione più distruttiva dell'app e prima bastava un
    // clic su una finestra di sistema che non spiegava nulla.
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfermaDialog, {
          maxWidth: '92vw',
          autoFocus: false,
          data: {
            titolo: 'Eliminare il tuo account?',
            messaggio:
              'L\'operazione è immediata e irreversibile: non potremo recuperare nulla, ' +
              'nemmeno su richiesta.',
            elenco: [
              'Il tuo profilo e le credenziali di accesso',
              'Tutte le proposte che hai scritto, con le loro foto',
              'I sostegni che hai ricevuto e quelli che hai dato ad altri',
              'Le segnalazioni che hai inviato',
            ],
            azione: 'Elimina il mio account',
            parolaChiave: 'ELIMINA',
          },
        })
        .afterClosed(),
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
