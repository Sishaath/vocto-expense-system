import { Routes } from '@angular/router';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { SubmitClaimComponent } from './submit-claim/submit-claim.component';
import { AccountsComponent } from './accounts/accounts.component';
import { MdComponent } from './md/md.component';
import { CreatePoComponent } from './create-po/create-po.component';
import { ViewPoComponent } from './view-po/view-po.component';
import { SetPasswordComponent } from './set-password/set-password.component';
import { authGuard, accountsGuard, mdGuard, adminGuard } from './guards/auth.guard';
import { AdminComponent } from './admin/admin.component';
import { ProfileComponent } from './profile/profile.component';
import { VendorsComponent } from './vendors/vendors.component';
import { VendorDetailComponent } from './vendor-detail/vendor-detail.component';
import { BudgetsComponent } from './budgets/budgets.component';
import { RecurringComponent } from './recurring/recurring.component';
import { CategoriesComponent } from './categories/categories.component';
import { AdvanceRequisitionComponent } from './advance-requisition/advance-requisition.component';
import { SalesInvoiceComponent } from './sales-invoice/sales-invoice.component';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'set-password', component: SetPasswordComponent },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'submit', component: SubmitClaimComponent, canActivate: [authGuard] },
  { path: 'edit/:id', component: SubmitClaimComponent, canActivate: [authGuard] },
  { path: 'accounts', component: AccountsComponent, canActivate: [accountsGuard] },
  { path: 'md', component: MdComponent, canActivate: [mdGuard] },
  { path: 'po/create', component: CreatePoComponent, canActivate: [authGuard] },
  { path: 'po/edit/:id', component: CreatePoComponent, canActivate: [authGuard] },
  { path: 'po/view/:id', component: ViewPoComponent, canActivate: [authGuard] },
  { path: 'profile', component: ProfileComponent, canActivate: [authGuard] },
  { path: 'vendors', component: VendorsComponent, canActivate: [authGuard] },
  { path: 'vendors/:id', component: VendorDetailComponent, canActivate: [authGuard] },
  { path: 'budgets', component: BudgetsComponent, canActivate: [accountsGuard] },
  { path: 'categories', component: CategoriesComponent, canActivate: [accountsGuard] },
  { path: 'recurring', component: RecurringComponent, canActivate: [authGuard] },
  { path: 'advance-requisition', component: AdvanceRequisitionComponent, canActivate: [authGuard] },
  { path: 'advance-requisition/:id', component: AdvanceRequisitionComponent, canActivate: [authGuard] },
  { path: 'invoice/export/create', component: SalesInvoiceComponent, canActivate: [authGuard] },
  { path: 'invoice/export/:id', component: SalesInvoiceComponent, canActivate: [authGuard] },
  { path: 'invoice/dta/create', component: SalesInvoiceComponent, canActivate: [authGuard] },
  { path: 'invoice/dta/:id', component: SalesInvoiceComponent, canActivate: [authGuard] },
  { path: 'admin', component: AdminComponent },
];