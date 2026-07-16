import { Routes } from '@angular/router';
import { Login } from './features/login/login';
import { Sintesi } from './features/sintesi/sintesi';
import { FeedbackList } from './features/feedback-list/feedback-list';
import { Moderazione } from './features/moderazione/moderazione';
import { staffGuard } from './core/staff.guard';

export const routes: Routes = [
  { path: 'accedi', component: Login, title: 'Accedi · Backoffice' },
  { path: '', component: Sintesi, canActivate: [staffGuard], title: 'Sintesi · Backoffice' },
  { path: 'feedback', component: FeedbackList, canActivate: [staffGuard], title: 'Feedback · Backoffice' },
  { path: 'feedback/:id', component: Moderazione, canActivate: [staffGuard], title: 'Moderazione · Backoffice' },
  // TODO(admin): categorie.
];
