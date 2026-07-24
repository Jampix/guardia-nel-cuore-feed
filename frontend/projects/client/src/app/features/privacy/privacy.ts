import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** Informativa privacy (bozza) — rotta pubblica, leggibile prima di registrarsi. */
@Component({
  selector: 'app-privacy',
  imports: [RouterLink, MatIconModule],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Privacy {}
