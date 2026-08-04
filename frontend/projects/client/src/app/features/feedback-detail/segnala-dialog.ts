import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatRadioModule } from '@angular/material/radio';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/** Motivi proposti: coprono i casi del regolamento d'uso. */
const MOTIVI = [
  'Contenuto offensivo o discriminatorio',
  'Fuori tema: non riguarda il paese',
  'Contiene dati personali di altre persone',
  'Spam o pubblicità',
  'Altro',
] as const;

/**
 * Dialog di segnalazione. Sostituisce il `prompt()` del browser, che era
 * l'unico punto dell'app fuori dal linguaggio Material: su iPhone compariva la
 * finestra di sistema, non personalizzabile e in certi contesti bloccata dal
 * browser.
 *
 * `afterClosed()` restituisce il motivo scelto (stringa) oppure `null` se si
 * annulla. Il motivo è facoltativo per il backend, ma qui lo chiediamo perché
 * allo staff serve per decidere in fretta.
 */
@Component({
  selector: 'app-segnala-dialog',
  imports: [MatDialogModule, MatButtonModule, MatRadioModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Segnala questa proposta</h2>
    <mat-dialog-content class="seg-content">
      <p class="intro">
        La segnalazione arriva allo staff dell'associazione, che verificherà il contenuto.
        Il tuo nome non viene mostrato all'autore della proposta.
      </p>

      <mat-radio-group class="motivi" [value]="motivo()" (change)="motivo.set($any($event).value)">
        @for (m of motivi; track m) {
          <mat-radio-button [value]="m">{{ m }}</mat-radio-button>
        }
      </mat-radio-group>

      @if (motivo() === 'Altro') {
        <mat-form-field appearance="outline" class="dettaglio">
          <mat-label>Spiega brevemente</mat-label>
          <textarea matInput rows="3" maxlength="500"
                    [value]="dettaglio()"
                    (input)="dettaglio.set($any($event.target).value)"></textarea>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="null">Annulla</button>
      <button mat-flat-button class="invia" [disabled]="!valido()" [mat-dialog-close]="testo()">
        Invia segnalazione
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .seg-content { max-width: 440px; font-size: 14px; line-height: 1.55; }
    .intro { margin: 0 0 14px; color: var(--mat-sys-on-surface-variant); }
    .motivi { display: flex; flex-direction: column; gap: 2px; }
    .dettaglio { width: 100%; margin-top: 12px; }
    .invia {
      --mat-button-filled-container-color: var(--mat-sys-error);
      font-weight: 600;
    }
  `],
})
export class SegnalaDialog {
  readonly motivi = MOTIVI;
  readonly motivo = signal<string | null>(null);
  readonly dettaglio = signal('');

  /** Con "Altro" la spiegazione diventa obbligatoria: da sola non direbbe nulla. */
  readonly valido = () =>
    this.motivo() !== null && (this.motivo() !== 'Altro' || this.dettaglio().trim().length > 0);

  /** Motivo da inviare: per "Altro" vale la spiegazione scritta. */
  readonly testo = () =>
    this.motivo() === 'Altro' ? this.dettaglio().trim() : (this.motivo() ?? '');

  constructor(readonly ref: MatDialogRef<SegnalaDialog>) {}
}
