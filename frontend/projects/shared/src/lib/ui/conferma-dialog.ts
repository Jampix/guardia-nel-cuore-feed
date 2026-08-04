import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface ConfermaDialogData {
  titolo: string;
  /** Cosa succede, in una o due frasi. Niente "sei sicuro?": va detto l'effetto. */
  messaggio: string;
  /** Righe puntate con ciò che viene rimosso o modificato (facoltative). */
  elenco?: string[];
  /** Etichetta del pulsante che conferma. */
  azione: string;
  /**
   * Se valorizzata, l'utente deve DIGITARE questa parola per abilitare la
   * conferma. Da usare solo per le azioni irreversibili di maggiore portata:
   * costringe a fermarsi un istante e impedisce il clic riflesso su un
   * pulsante rosso.
   */
  parolaChiave?: string;
}

/**
 * Conferma per azioni distruttive, condivisa da client e admin.
 *
 * Sostituisce il `confirm()` del browser: quello mostra una finestra di sistema
 * fuori dal linguaggio dell'app, non si può spiegare cosa accade e su iOS
 * appare come un avviso anonimo. Qui invece l'effetto è dichiarato.
 *
 * `afterClosed()` restituisce `true` solo se si conferma.
 */
@Component({
  selector: 'lib-conferma',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ data.titolo }}</h2>
    <mat-dialog-content class="cf-content">
      <p class="msg">{{ data.messaggio }}</p>

      @if (data.elenco?.length) {
        <ul class="elenco">
          @for (r of data.elenco; track r) {
            <li><mat-icon>remove_circle_outline</mat-icon><span>{{ r }}</span></li>
          }
        </ul>
      }

      @if (data.parolaChiave) {
        <p class="richiesta">
          Per procedere scrivi <strong>{{ data.parolaChiave }}</strong> qui sotto.
        </p>
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Conferma</mat-label>
          <input matInput [value]="digitato()" (input)="digitato.set($any($event.target).value)"
                 autocomplete="off" autocapitalize="characters" />
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Annulla</button>
      <button mat-flat-button class="pericolo" [disabled]="!abilitato()" [mat-dialog-close]="true">
        {{ data.azione }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cf-content { max-width: 440px; font-size: 14px; line-height: 1.55; }
    .msg { margin: 0 0 12px; }
    .elenco { list-style: none; margin: 0 0 12px; padding: 0; }
    .elenco li {
      display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px;
      color: var(--mat-sys-on-surface-variant);
    }
    .elenco mat-icon {
      flex: 0 0 auto; font-size: 17px; width: 17px; height: 17px; margin-top: 2px;
    }
    .elenco li > span { flex: 1 1 auto; min-width: 0; }
    .richiesta { margin: 4px 0 8px; }
    .campo { width: 100%; }
    .pericolo { --mat-button-filled-container-color: var(--mat-sys-error); font-weight: 600; }
  `],
})
export class ConfermaDialog {
  readonly data = inject<ConfermaDialogData>(MAT_DIALOG_DATA);
  readonly digitato = signal('');

  /** Senza parola chiave la conferma è sempre attiva; con essa serve la parola esatta. */
  readonly abilitato = () =>
    !this.data.parolaChiave ||
    this.digitato().trim().toUpperCase() === this.data.parolaChiave.toUpperCase();
}
