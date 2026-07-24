import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/** Indicatore di caricamento centrato, riusabile da client e admin. */
@Component({
  selector: 'lib-loading',
  imports: [MatProgressSpinnerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <mat-spinner [diameter]="36"></mat-spinner>
      @if (label()) { <p>{{ label() }}</p> }
    </div>
  `,
  styles: [`
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 16px;
      color: var(--mat-sys-on-surface-variant);
    }
    p { margin: 0; font-size: 13.5px; }
  `],
})
export class Loading {
  /** Testo opzionale sotto lo spinner (es. "Caricamento proposte…"). */
  readonly label = input('');
}
