import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminUsersService, PendingUser } from '../../core/admin-users.service';

/** Iscrizioni cittadini in attesa: approva o rifiuta. */
@Component({
  selector: 'app-iscrizioni',
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './iscrizioni.html',
  styleUrl: './iscrizioni.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Iscrizioni {
  private readonly service = inject(AdminUsersService);
  private readonly snack = inject(MatSnackBar);

  readonly pending = signal<PendingUser[]>([]);
  readonly acting = signal<string | null>(null);

  constructor() {
    this.load();
  }

  private load(): void {
    this.service.getPending().subscribe({
      next: (p) => this.pending.set(p),
      error: () => this.snack.open('Errore nel caricamento.', 'OK', { duration: 3000 }),
    });
  }

  approve(u: PendingUser): void {
    this.acting.set(u.username);
    this.service.approve(u.username).subscribe({
      next: () => {
        this.snack.open(`${u.nickname || u.email} approvato.`, 'OK', { duration: 3000 });
        this.remove(u.username);
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
        this.remove(u.username);
      },
      error: () => this.done('Operazione non riuscita.'),
    });
  }

  private remove(username: string): void {
    this.pending.update((list) => list.filter((x) => x.username !== username));
    this.acting.set(null);
  }

  private done(msg: string): void {
    this.acting.set(null);
    this.snack.open(msg, 'OK', { duration: 3000 });
  }
}
