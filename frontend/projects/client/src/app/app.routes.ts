import { Routes } from '@angular/router';
import { Bacheca } from './features/bacheca/bacheca';
import { FeedbackDetail } from './features/feedback-detail/feedback-detail';
import { NuovaProposta } from './features/nuova-proposta/nuova-proposta';

export const routes: Routes = [
  { path: '', component: Bacheca, title: 'Bacheca · Guardia nel Cuore' },
  { path: 'nuova', component: NuovaProposta, title: 'Nuova proposta · Guardia nel Cuore' },
  { path: 'feedback/:id', component: FeedbackDetail, title: 'Dettaglio · Guardia nel Cuore' },
  // TODO(Incr. 4): esplora, i miei feedback, profilo.
];
