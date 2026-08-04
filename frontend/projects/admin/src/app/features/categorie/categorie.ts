import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Category, ConfermaDialog } from 'shared';
import { AdminCategoryService } from '../../core/admin-category.service';

/** Gestione categorie del backoffice: crea, rinomina, attiva/disattiva, elimina. */
@Component({
  selector: 'app-categorie',
  imports: [MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, MatSlideToggleModule],
  templateUrl: './categorie.html',
  styleUrl: './categorie.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Categorie {
  private readonly service = inject(AdminCategoryService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly categories = signal<Category[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly busy = signal(false);

  constructor() {
    this.load();
  }

  private load(): void {
    this.service.getAll().subscribe({
      next: (c) => this.categories.set(c),
      error: () => this.snack.open('Errore nel caricamento.', 'OK', { duration: 3000 }),
    });
  }

  private fail(msg: string): void {
    this.snack.open(msg, 'OK', { duration: 3000 });
  }

  add(nome: string): void {
    const n = nome.trim();
    if (!n) return;
    this.busy.set(true);
    this.service.create(n).subscribe({
      next: () => { this.busy.set(false); this.load(); },
      error: () => { this.busy.set(false); this.fail('Creazione non riuscita.'); },
    });
  }

  toggle(cat: Category): void {
    this.service.update(cat.id, { attiva: !cat.attiva }).subscribe({
      next: () => this.load(),
      error: () => this.fail('Aggiornamento non riuscito.'),
    });
  }

  startEdit(cat: Category): void {
    this.editingId.set(cat.id);
  }

  cancelEdit(): void {
    this.editingId.set(null);
  }

  saveEdit(cat: Category, nome: string): void {
    const n = nome.trim();
    if (!n) return;
    this.service.update(cat.id, { nome: n }).subscribe({
      next: () => { this.editingId.set(null); this.load(); },
      error: () => this.fail('Rinomina non riuscita.'),
    });
  }

  remove(cat: Category): void {
    this.dialog
      .open(ConfermaDialog, {
        maxWidth: '92vw',
        autoFocus: false,
        data: {
          titolo: 'Eliminare questa categoria?',
          messaggio:
            `«${cat.nome}» non sarà più selezionabile per le nuove proposte. ` +
            'Le proposte esistenti che la usano restano, ma perdono l\'etichetta.',
          azione: 'Elimina',
        },
      })
      .afterClosed()
      .subscribe((ok: boolean) => {
        if (!ok) return;
        this.service.remove(cat.id).subscribe({
          next: () => this.load(),
          error: () => this.fail('Eliminazione non riuscita.'),
        });
      });
  }
}
