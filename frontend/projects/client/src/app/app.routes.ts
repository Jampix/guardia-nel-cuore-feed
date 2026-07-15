import { Routes } from '@angular/router';
import { Bacheca } from './features/bacheca/bacheca';
import { FeedbackDetail } from './features/feedback-detail/feedback-detail';

export const routes: Routes = [
  { path: '', component: Bacheca, title: 'Bacheca · Guardia nel Cuore' },
  { path: 'feedback/:id', component: FeedbackDetail, title: 'Dettaglio · Guardia nel Cuore' },
  // TODO(Incr. 4): esplora, nuova proposta, i miei feedback, profilo.
];
