import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  users: any[] = [];
  authMap: Record<string, { lastLogin: string | null; userId: string; confirmed: boolean }> = {};
  loading = true;
  adminEmail = '';
  search = '';
  filterRole = '';

  inviteEmail = '';
  inviteRole = 'employee';
  inviting = false;
  inviteError = '';

  confirmUser: any = null;
  confirmNewRole = '';
  confirmDelete: any = null;

  readonly ROLES = ['employee', 'accounts', 'md', 'admin'];
  readonly ROLE_LABELS: Record<string, string> = {
    employee: 'Employee', accounts: 'Accounts', md: 'MD', admin: 'Admin'
  };

  constructor(private supabase: SupabaseService, private router: Router, private toast: ToastService) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.adminEmail = session.user.email || '';
    await this.loadAll();
  }

  async loadAll() {
    this.loading = true;
    const [rolesRes, authRes] = await Promise.all([
      this.supabase.getAllUserRoles(),
      fetch(`${environment.apiBaseUrl}/api/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
        body: JSON.stringify({ action: 'list' })
      }).then(r => r.json()).catch(() => ({ map: {} }))
    ]);
    this.users = rolesRes.data || [];
    this.authMap = authRes.map || {};
    this.loading = false;
  }

  get filtered() {
    let list = this.users;
    if (this.filterRole) list = list.filter(u => u.role === this.filterRole);
    if (this.search) {
      const q = this.search.toLowerCase();
      list = list.filter(u => u.email?.toLowerCase().includes(q));
    }
    return list;
  }

  countByRole(role: string) { return this.users.filter(u => u.role === role).length; }

  async inviteUser() {
    this.inviteError = '';
    if (!this.inviteEmail.trim()) { this.inviteError = 'Enter an email address.'; return; }
    if (this.inviteEmail.trim().toLowerCase() === this.adminEmail.toLowerCase()) {
      this.inviteError = 'You cannot add yourself.'; return;
    }
    this.inviting = true;
    try {
      const res = await fetch(`${environment.apiBaseUrl}/api/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
        body: JSON.stringify({ email: this.inviteEmail.trim(), role: this.inviteRole, invitedBy: this.adminEmail })
      });
      const json = await res.json();
      if (!res.ok) { this.inviteError = json.error || 'Failed to invite user.'; }
      else {
        this.toast.show(`Invite sent to ${this.inviteEmail.trim()}`);
        this.inviteEmail = '';
        this.inviteRole = 'employee';
        await this.loadAll();
      }
    } catch { this.inviteError = 'Network error. Please try again.'; }
    this.inviting = false;
  }

  async resendInvite(user: any) {
    const res = await fetch(`${environment.apiBaseUrl}/api/invite-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
      body: JSON.stringify({ email: user.email, role: user.role, invitedBy: this.adminEmail })
    });
    if (res.ok) this.toast.show(`Invite resent to ${user.email}`);
    else this.toast.show('Failed to resend invite.', 'error');
  }

  async toggleActive(user: any) {
    const newActive = !user.active;
    const { error } = await this.supabase.getClient()
      .from('user_roles').update({ active: newActive }).eq('email', user.email);
    if (error) { this.toast.show('Failed to update status.', 'error'); return; }
    user.active = newActive;
    this.toast.show(`${user.email} marked as ${newActive ? 'Active' : 'Inactive'}`);
  }

  openConfirm(user: any, newRole: string) {
    if (newRole === user.role) return;
    if (user.email === this.adminEmail) { this.toast.show('You cannot change your own role.', 'error'); return; }
    this.confirmUser = user;
    this.confirmNewRole = newRole;
  }

  cancelConfirm() { this.confirmUser = null; this.confirmNewRole = ''; }

  async confirmChange() {
    if (!this.confirmUser) return;
    const { error } = await this.supabase.updateUserRole(this.confirmUser.email, this.confirmNewRole, this.adminEmail);
    if (error) { this.toast.show('Failed to update role.', 'error'); }
    else {
      this.toast.show(`${this.confirmUser.email} is now ${this.ROLE_LABELS[this.confirmNewRole]}`);
      await this.loadAll();
    }
    this.cancelConfirm();
  }

  openDeleteConfirm(user: any) {
    if (user.email === this.adminEmail) { this.toast.show('You cannot delete yourself.', 'error'); return; }
    this.confirmDelete = user;
  }

  cancelDelete() { this.confirmDelete = null; }

  async confirmDeleteUser() {
    if (!this.confirmDelete) return;
    const user = this.confirmDelete;
    this.cancelDelete();
    try {
      const authInfo = this.authMap[user.email];
      await fetch(`${environment.apiBaseUrl}/api/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
        body: JSON.stringify({ action: 'delete', userId: authInfo?.userId, email: user.email })
      });
      this.toast.show(`${user.email} deleted`);
      await this.loadAll();
    } catch { this.toast.show('Failed to delete user.', 'error'); }
  }

  formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  logout() { this.supabase.getClient().auth.signOut().then(() => this.router.navigate(['/login'])); }
}
