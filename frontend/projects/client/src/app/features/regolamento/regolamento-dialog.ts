import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface RegolamentoDialogData {
  /** 'full' = testo completo (registrazione); 'reminder' = promemoria breve (crea/modifica). */
  mode: 'full' | 'reminder';
}

/**
 * Dialog del regolamento d'uso. In `full` mostra le regole e richiede
 * l'accettazione per proseguire; in `reminder` ricorda soltanto di rispettarle.
 * `afterClosed()` restituisce `true` se l'utente accetta.
 */
@Component({
  selector: 'app-regolamento-dialog',
  imports: [RouterLink, MatDialogModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data.mode === 'full') {
      <h2 mat-dialog-title>Regolamento d'uso</h2>
      <mat-dialog-content class="reg-content">
        <p>Per partecipare devi accettare queste regole.</p>
        <p class="ok"><strong>Puoi pubblicare</strong> proposte, idee e segnalazioni sul paese,
          veritiere e rispettose, con foto pertinenti di cui hai i diritti.</p>
        <p class="no"><strong>Non è ammesso</strong>: insulti, minacce, odio o discriminazioni;
          contenuti diffamatori, volgari o illegali; dati personali di altri; spam o pubblicità;
          impersonare altri o l'associazione.</p>
        <p>Ogni proposta nasce privata e viene pubblicata dallo staff dopo verifica; contenuti
          che violano il regolamento possono non essere pubblicati, essere nascosti o rimossi.</p>
        <p><a routerLink="/regolamento" target="_blank" mat-dialog-close>Leggi il regolamento completo ↗</a></p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button [mat-dialog-close]="false">Annulla</button>
        <button mat-flat-button class="accept" [mat-dialog-close]="true">Accetto e continuo</button>
      </mat-dialog-actions>
    } @else {
      <h2 mat-dialog-title>Prima di pubblicare</h2>
      <mat-dialog-content class="reg-content">
        <p>Ricorda di rispettare il <a routerLink="/regolamento" target="_blank" mat-dialog-close>regolamento d'uso</a>:
          contenuti veri e rispettosi, niente offese, dati personali altrui o spam.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button [mat-dialog-close]="false">Annulla</button>
        <button mat-flat-button class="accept" [mat-dialog-close]="true">Accetto e pubblico</button>
      </mat-dialog-actions>
    }
  `,
  styles: [`
    .reg-content { max-width: 460px; font-size: 14px; line-height: 1.55; }
    .reg-content p { margin: 0 0 10px; }
    .reg-content .no { color: var(--mat-sys-on-surface); }
    .reg-content a { color: var(--mat-sys-primary); font-weight: 600; text-decoration: none; }
    .accept { --mat-button-filled-container-color: var(--mat-sys-primary); font-weight: 600; }
  `],
})
export class RegolamentoDialog {
  readonly data = inject<RegolamentoDialogData>(MAT_DIALOG_DATA);
  readonly ref = inject(MatDialogRef<RegolamentoDialog>);
}
