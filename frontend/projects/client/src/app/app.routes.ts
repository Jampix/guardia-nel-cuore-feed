import { Routes } from '@angular/router';
import { Bacheca } from './features/bacheca/bacheca';

export const routes: Routes = [
  { path: '', component: Bacheca, title: 'Bacheca · Guardia nel Cuore' },
  // TODO(Incr. 4): esplora, nuova proposta, i miei feedback, profilo.
];
