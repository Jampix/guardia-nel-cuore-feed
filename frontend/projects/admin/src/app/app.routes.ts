import { Routes } from '@angular/router';
import { Login } from './features/login/login';
import { Sintesi } from './features/sintesi/sintesi';
import { staffGuard } from './core/staff.guard';

export const routes: Routes = [
  { path: 'accedi', component: Login, title: 'Accedi · Backoffice' },
  { path: '', component: Sintesi, canActivate: [staffGuard], title: 'Sintesi · Backoffice' },
  // TODO(admin): feedback (lista/moderazione), categorie.
];
