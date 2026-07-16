import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from 'shared';

/** Dashboard di sintesi del backoffice (KPI + coda). Dati reali: prossimo passo. */
@Component({
  selector: 'app-sintesi',
  imports: [],
  templateUrl: './sintesi.html',
  styleUrl: './sintesi.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sintesi {
  private readonly auth = inject(AuthService);
  readonly user = this.auth.user;
}
