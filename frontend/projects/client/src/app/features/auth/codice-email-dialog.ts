import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Dialog "dove trovo il codice". Il codice di verifica lo invia il mailer
 * interno di Cognito da un mittente AWS condiviso, non allineato al nostro
 * dominio: finisce spesso in spam anche su Gmail. Lo spieghiamo al cittadino
 * appena arriva sulla conferma, prima che vada a cercare l'email e si arrenda.
 *
 * `afterClosed()` restituisce 'resend' se l'utente chiede di rinviare il codice.
 */
@Component({
  selector: 'app-codice-email-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Dove trovare il codice</h2>
    <mat-dialog-content class="cod-content">
      <p class="intro">
        Il codice di 6 cifre arriva per email, a volte dopo un paio di minuti. Capita spesso che
        finisca fra la posta indesiderata.
      </p>

      <div class="sender">
        <div>
          <span class="sender-label">Mittente</span>
          <code>no-reply&#64;verificationemail.com</code>
        </div>
        <div>
          <span class="sender-label">Oggetto</span>
          <span class="subject">Guardia nel Cuore — codice di verifica</span>
        </div>
      </div>

      <ol class="steps">
        <li>
          <mat-icon>folder</mat-icon>
          <span>Apri la cartella <strong>Spam</strong> (o <strong>Posta indesiderata</strong>) della
            tua casella e cerca il mittente qui sopra.</span>
        </li>
        <li>
          <mat-icon>thumb_up</mat-icon>
          <span>Se la trovi lì, segnala l'email come <strong>&ldquo;Non è spam&rdquo;</strong>: le
            prossime arriveranno nella posta in arrivo.</span>
        </li>
        <li>
          <mat-icon>spellcheck</mat-icon>
          <span>Verifica che la tua email sia scritta correttamente, senza errori di battitura.</span>
        </li>
      </ol>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="'resend'">Rinvia codice</button>
      <button mat-flat-button class="accept" [mat-dialog-close]="null">Ho capito</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cod-content { max-width: 460px; font-size: 14px; line-height: 1.55; }
    .intro { margin: 0 0 14px; }

    /* Etichetta sopra e valore a piena larghezza: in due colonne l'indirizzo
       email restava troppo stretto e si spezzava a meta' parola. */
    .sender {
      display: grid;
      gap: 10px;
      background: var(--mat-sys-surface-container-high);
      border-radius: 12px;
      padding: 10px 12px;
      margin-bottom: 16px;
      font-size: 13px;
    }
    .sender-label {
      display: block;
      color: var(--mat-sys-on-surface-variant);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: .04em;
    }
    .sender code {
      display: block;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
    }
    .sender .subject { display: block; overflow-wrap: anywhere; }

    .steps { list-style: none; margin: 0; padding: 0; }
    .steps li {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
    }
    .steps li:last-child { margin-bottom: 0; }
    .steps li > span { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
    .steps mat-icon {
      flex: 0 0 auto;
      font-size: 20px;
      width: 20px;
      height: 20px;
      margin-top: 1px;
      color: var(--mat-sys-primary);
    }

    .accept { --mat-button-filled-container-color: var(--mat-sys-primary); font-weight: 600; }
  `],
})
export class CodiceEmailDialog {}
