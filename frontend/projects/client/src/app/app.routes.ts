import { Routes } from '@angular/router';
import { Bacheca } from './features/bacheca/bacheca';
import { FeedbackDetail } from './features/feedback-detail/feedback-detail';
import { NuovaProposta } from './features/nuova-proposta/nuova-proposta';
import { ModificaProposta } from './features/modifica-proposta/modifica-proposta';
import { MieiFeedback } from './features/miei-feedback/miei-feedback';
import { Auth } from './features/auth/auth';
import { Profilo } from './features/profilo/profilo';
import { Privacy } from './features/privacy/privacy';
import { Regolamento } from './features/regolamento/regolamento';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  // Contenuti privati: accessibili solo ai cittadini autenticati (approvati).
  { path: '', component: Bacheca, canActivate: [authGuard], title: 'Bacheca · Guardia nel Cuore' },
  { path: 'nuova', component: NuovaProposta, canActivate: [authGuard], title: 'Nuova proposta · Guardia nel Cuore' },
  { path: 'miei', component: MieiFeedback, canActivate: [authGuard], title: 'I miei feedback · Guardia nel Cuore' },
  { path: 'modifica/:id', component: ModificaProposta, canActivate: [authGuard], title: 'Modifica proposta · Guardia nel Cuore' },
  { path: 'feedback/:id', component: FeedbackDetail, canActivate: [authGuard], title: 'Dettaglio · Guardia nel Cuore' },
  // Rotte pubbliche: solo autenticazione.
  { path: 'accedi', component: Auth, data: { mode: 'login' }, title: 'Accedi · Guardia nel Cuore' },
  { path: 'registrati', component: Auth, data: { mode: 'register' }, title: 'Registrati · Guardia nel Cuore' },
  { path: 'conferma', component: Auth, data: { mode: 'confirm' }, title: 'Conferma · Guardia nel Cuore' },
  { path: 'privacy', component: Privacy, title: 'Privacy · Guardia nel Cuore' },
  { path: 'regolamento', component: Regolamento, title: 'Regolamento · Guardia nel Cuore' },
  { path: 'profilo', component: Profilo, canActivate: [authGuard], title: 'Profilo · Guardia nel Cuore' },
];
