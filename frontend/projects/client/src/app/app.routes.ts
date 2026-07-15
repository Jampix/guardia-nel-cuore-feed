import { Routes } from '@angular/router';
import { Bacheca } from './features/bacheca/bacheca';
import { FeedbackDetail } from './features/feedback-detail/feedback-detail';
import { NuovaProposta } from './features/nuova-proposta/nuova-proposta';
import { Auth } from './features/auth/auth';

export const routes: Routes = [
  { path: '', component: Bacheca, title: 'Bacheca · Guardia nel Cuore' },
  { path: 'nuova', component: NuovaProposta, title: 'Nuova proposta · Guardia nel Cuore' },
  { path: 'feedback/:id', component: FeedbackDetail, title: 'Dettaglio · Guardia nel Cuore' },
  { path: 'accedi', component: Auth, data: { mode: 'login' }, title: 'Accedi · Guardia nel Cuore' },
  { path: 'registrati', component: Auth, data: { mode: 'register' }, title: 'Registrati · Guardia nel Cuore' },
  { path: 'conferma', component: Auth, data: { mode: 'confirm' }, title: 'Conferma · Guardia nel Cuore' },
  // TODO(Incr. 4): i miei feedback, profilo.
];
