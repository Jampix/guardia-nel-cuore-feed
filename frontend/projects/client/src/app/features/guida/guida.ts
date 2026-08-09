import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/**
 * Guida all'app — rotta **pubblica**, come regolamento e privacy.
 *
 * Esiste perché la pagina di accesso è un muro: chi arriva su
 * feed.guardianelcuore.it vede tre righe e un modulo che chiede nome, cognome,
 * email e password. Questa pagina risponde a «cos'è e perché dovrei iscrivermi»
 * *prima* di chiedere tutto quello.
 *
 * ⚠️ Il contenuto è lo stesso della **guida stampabile**
 * (`docs/brochure/guida-cittadino.html`), ma il markup NON è condiviso: quella è
 * un documento A4 con larghezza fissa in millimetri e mockup a pixel fissi, che
 * su un telefono scorrerebbe in orizzontale. Le due copie vanno cambiate
 * **insieme** — è così che la brochure si era riempita di errori.
 */
@Component({
  selector: 'app-guida',
  imports: [RouterLink, MatIconModule],
  templateUrl: './guida.html',
  styleUrl: './guida.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Guida {}
