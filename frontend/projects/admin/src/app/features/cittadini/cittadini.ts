import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminUsersService, Citizen, PendingUser } from '../../core/admin-users.service';

type View = 'attesa' | 'attivi';

/** Gestione persone: iscrizioni in attesa (approva/rifiuta) + cittadini attivi. */
@Component({
  selector: 'app-cittadini',
  imports: [DatePipe, MatButtonToggleModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  templateUrl: './cittadini.html',
  styleUrl: './cittadini.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cittadini {
  private readonly service = inject(AdminUsersService);
  private readonly snack = inject(MatSnackBar);

  readonly view = signal<View>('attesa');
  readonly pending = signal<PendingUser[]>([]);
  readonly citizens = signal<Citizen[]>([]);
  readonly search = signal('');
  readonly acting = signal<string | null>(null);

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
      next: (p) => this.pending.set(p),
      error: () => this.fail('Errore nel caricamento delle iscrizioni.'),
    });
  }

  private loadCitizens(): void {
    this.service.getCitizens().subscribe({
      next: (c) => this.citizens.set(c),
      error: () => this.fail('Errore nel caricamento dei cittadini.'),
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
    if (!confirm(`Rifiutare e rimuovere l'iscrizione di ${u.nickname || u.email}?`)) return;
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
