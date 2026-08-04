import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export interface EliminaDialogData {
  titolo: string;
  /** Sostegni ricevuti da altri cittadini: spariscono con la proposta. */
  voti: number;
  /** True se l'associazione ha già risposto pubblicamente. */
  haRisposta: boolean;
  /** True se la proposta è visibile in bacheca. */
  pubblicata: boolean;
}

/**
 * Conferma di eliminazione. Sostituisce il `confirm()` del browser, ma
 * soprattutto DICE LE CONSEGUENZE: se la proposta è pubblicata, eliminandola
 * spariscono anche i sostegni degli altri cittadini e la risposta
 * dell'associazione. Un "sei sicuro?" generico non permette di capirlo.
 *
 * `afterClosed()` restituisce `true` solo se si conferma.
 */
@Component({
  selector: 'app-elimina-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Eliminare questa proposta?</h2>
    <mat-dialog-content class="el-content">
      <p class="titolo">«{{ data.titolo }}»</p>

      @if (data.pubblicata) {
        <div class="avviso">
          <mat-icon>groups</mat-icon>
          <span>
            È pubblicata in bacheca: l'hanno letta altri cittadini.
            @if (data.voti > 0) {
              Eliminandola spariscono anche
              <strong>{{ data.voti }} {{ data.voti === 1 ? 'sostegno' : 'sostegni' }}</strong>
              che hai ricevuto.
            }
            @if (data.haRisposta) {
              Sparisce anche la <strong>risposta dell'associazione</strong>.
            }
          </span>
        </div>
      }

      <p class="nota">
        L'operazione è <strong>irreversibile</strong>: la proposta e la sua foto non si
        possono recuperare.
        @if (data.pubblicata) {
          Se ti serve solo una correzione, scrivi allo staff invece di eliminare.
        }
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false">Annulla</button>
      <button mat-flat-button class="elimina" [mat-dialog-close]="true">Elimina</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .el-content { max-width: 440px; font-size: 14px; line-height: 1.55; }
    .titolo { margin: 0 0 14px; font-weight: 600; }
    .avviso {
      display: flex;
      align-items: flex-start;
      gap: 9px;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      border-radius: 12px;
      padding: 11px 13px;
      margin-bottom: 14px;
      mat-icon { flex: 0 0 auto; font-size: 19px; width: 19px; height: 19px; margin-top: 1px; }
      > span { flex: 1 1 auto; min-width: 0; }
    }
    .nota { margin: 0; color: var(--mat-sys-on-surface-variant); }
    .elimina {
      --mat-button-filled-container-color: var(--mat-sys-error);
      font-weight: 600;
    }
  `],
})
export class EliminaDialog {
  readonly data = inject<EliminaDialogData>(MAT_DIALOG_DATA);
}
