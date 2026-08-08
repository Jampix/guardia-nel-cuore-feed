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

/**
 * Gestione persone: cittadini attivi + chi NON è attivo.
 *
 * Dall'8 agosto 2026 l'attivazione è automatica (la fa il trigger alla verifica
 * dell'email), quindi la prima scheda non è più una coda da smaltire: normalmente
 * è vuota, e chi ci compare è un'anomalia — qualcuno rimosso dal gruppo o
 * un'attivazione non riuscita. Il pulsante «Approva» resta come rimedio.
 */
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
    // Rifiutare cancella l'account E TUTTI I SUOI DATI. Prima l'operazione
    // eliminava solo l'utente Cognito e lasciava proposte, foto, voti e
    // segnalazioni orfani: ora la pulizia è vera, quindi l'effetto è più grande
    // e va dichiarato per intero. Per il solo blocco dell'accesso c'è
    // «Rimuovi accesso», che non cancella niente.
    this.dialog
      .open(ConfermaDialog, {
        maxWidth: '92vw',
        autoFocus: false,
        data: {
          titolo: 'Eliminare questa persona e i suoi dati?',
          messaggio:
            `Vengono eliminati l'account di ${u.nickname || u.email} e tutto ciò che ha ` +
            'scritto: proposte, foto, sostegni dati e segnalazioni inviate. ' +
            'L\'operazione è irreversibile. Se vuoi solo impedirle di accedere, ' +
            'usa «Rimuovi accesso» dalla scheda Attivi: i contenuti restano.',
          parolaChiave: 'ELIMINA',
          azione: 'Elimina tutto',
        },
      })
      .afterClosed()
      .subscribe((ok: boolean) => { if (ok) this.doReject(u); });
  }

  /**
   * Toglie l'accesso a un cittadino attivo, senza cancellare nulla.
   *
   * È l'operazione che serviva e che non esisteva: prima si poteva solo passare
   * dalla console Cognito, oppure eliminare tutto — e in mezzo non c'era niente.
   */
  revoke(c: Citizen): void {
    this.dialog
      .open(ConfermaDialog, {
        maxWidth: '92vw',
        autoFocus: false,
        data: {
          titolo: 'Togliere l\'accesso?',
          messaggio:
            `${c.nickname || c.email} non potrà più accedere. Le sue proposte, i suoi ` +
            'sostegni e le risposte già pubblicate RESTANO dove sono. ' +
            'Puoi riabilitarla in qualsiasi momento dalla scheda «Non attivi».',
          azione: 'Rimuovi accesso',
        },
      })
      .afterClosed()
      .subscribe((ok: boolean) => { if (ok) this.doRevoke(c); });
  }

  private doRevoke(c: Citizen): void {
    this.acting.set(c.username);
    this.service.revoke(c.username).subscribe({
      next: () => {
        this.snack.open(`Accesso rimosso a ${c.nickname || c.email}.`, 'OK', { duration: 3000 });
        this.citizens.update((l) => l.filter((x) => x.username !== c.username));
        this.acting.set(null);
        this.loadPending();
      },
      error: () => this.done('Rimozione dell\'accesso non riuscita.'),
    });
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
