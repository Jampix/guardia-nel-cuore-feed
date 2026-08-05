import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ConfermaDialog, Loading } from 'shared';
import { TIPO_UTENTE_LABEL, AdminUsersService, Citizen, PendingUser } from '../../core/admin-users.service';

type View = 'attesa' | 'attivi';

/** Gestione persone: iscrizioni in attesa (approva/rifiuta) + cittadini attivi. */
@Component({
  selector: 'app-cittadini',
  imports: [DatePipe, MatButtonToggleModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, Loading],
  templateUrl: './cittadini.html',
  styleUrl: './cittadini.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cittadini {
  private readonly service = inject(AdminUsersService);
  private readonly dialog = inject(MatDialog);
  readonly tipoLabel = TIPO_UTENTE_LABEL;
  private readonly snack = inject(MatSnackBar);

  readonly view = signal<View>('attesa');
  readonly pending = signal<PendingUser[]>([]);
  readonly citizens = signal<Citizen[]>([]);
  readonly search = signal('');
  readonly acting = signal<string | null>(null);
  readonly loadingPending = signal(true);
  readonly loadingCitizens = signal(true);

  readonly filteredCitizens = computed(() => {
    const q = this.search().trim().toLowerCase();
    const list = this.citizens();
    if (!q) return list;
    return list.filter(
      (c) => (c.nickname ?? '').toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q),
    );
  });

  constructor() {
    this.loadPending();
    this.loadCitizens();
  }

  private loadPending(): void {
    this.service.getPending().subscribe({
      next: (p) => { this.pending.set(p); this.loadingPending.set(false); },
      error: () => { this.loadingPending.set(false); this.fail('Errore nel caricamento delle iscrizioni.'); },
    });
  }

  private loadCitizens(): void {
    this.service.getCitizens().subscribe({
      next: (c) => { this.citizens.set(c); this.loadingCitizens.set(false); },
      error: () => { this.loadingCitizens.set(false); this.fail('Errore nel caricamento dei cittadini.'); },
    });
  }

  setView(v: View): void {
    this.view.set(v);
  }

  approve(u: PendingUser): void {
    this.acting.set(u.username);
    this.service.approve(u.username).subscribe({
      next: () => {
        this.snack.open(`${u.nickname || u.email} approvato.`, 'OK', { duration: 3000 });
        this.pending.update((l) => l.filter((x) => x.username !== u.username));
        this.acting.set(null);
        this.loadCitizens();
      },
      error: () => this.done('Approvazione non riuscita.'),
    });
  }

  reject(u: PendingUser): void {
    // Rifiutare CANCELLA l'account: la persona dovrebbe rifare tutto da capo,
    // quindi l'effetto va dichiarato invece di chiedere un generico "sei sicuro".
    this.dialog
      .open(ConfermaDialog, {
        maxWidth: '92vw',
        autoFocus: false,
        data: {
          titolo: 'Rifiutare questa iscrizione?',
          messaggio:
            `L'account di ${u.nickname || u.email} viene eliminato. Se in futuro volesse ` +
            'partecipare dovrebbe registrarsi di nuovo e attendere una nuova approvazione.',
          azione: 'Rifiuta ed elimina',
        },
      })
      .afterClosed()
      .subscribe((ok: boolean) => { if (ok) this.doReject(u); });
  }

  private doReject(u: PendingUser): void {
    this.acting.set(u.username);
    this.service.reject(u.username).subscribe({
      next: () => {
        this.snack.open('Iscrizione rifiutata.', 'OK', { duration: 3000 });
        this.pending.update((l) => l.filter((x) => x.username !== u.username));
        this.acting.set(null);
      },
      error: () => this.done('Operazione non riuscita.'),
    });
  }

  private done(msg: string): void {
    this.acting.set(null);
    this.fail(msg);
  }

  private fail(msg: string): void {
    this.snack.open(msg, 'OK', { duration: 3000 });
  }
}
