import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/** Regolamento d'uso — rotta pubblica, leggibile prima di registrarsi. */
@Component({
  selector: 'app-regolamento',
  imports: [RouterLink, MatIconModule],
  templateUrl: './regolamento.html',
  styleUrl: './regolamento.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Regolamento {}
