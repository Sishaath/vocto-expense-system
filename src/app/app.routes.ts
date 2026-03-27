import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SubmitClaimComponent } from './submit-claim/submit-claim.component';
import { AccountsComponent } from './accounts/accounts.component';
import { MdComponent } from './md/md.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'dashboard', component: DashboardComponent },
  { path: 'submit', component: SubmitClaimComponent },
  { path: 'edit/:id', component: SubmitClaimComponent },
  { path: 'accounts', component: AccountsComponent },
  { path: 'md', component: MdComponent },
];