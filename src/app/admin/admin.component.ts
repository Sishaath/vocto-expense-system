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
  inviteLink = '';
  copied = false;

  rolePickerUser: any = null;
  rolePickerSelected = '';

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

  isPending(user: any): boolean {
    const auth = this.authMap[user.email];
    return auth !== undefined && !auth.confirmed;
  }

  async inviteUser() {
    this.inviteError = '';
    this.inviteLink = '';
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
        this.inviteLink = json.inviteLink || '';
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
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      if (json.inviteLink) { this.inviteLink = json.inviteLink; this.copied = false; }
      this.toast.show(`Invite resent to ${user.email}`);
    } else {
      this.toast.show('Failed to resend invite.', 'error');
    }
  }

  async copyInviteLink() {
    if (!this.inviteLink) return;
    try {
      await navigator.clipboard.writeText(this.inviteLink);
      this.copied = true;
      setTimeout(() => this.copied = false, 2500);
    } catch {
      this.toast.show('Could not copy — please copy the link manually.', 'error');
    }
  }

  dismissInviteLink() { this.inviteLink = ''; this.copied = false; }

  async toggleActive(user: any) {
    const newActive = !user.active;
    const { error } = await this.supabase.getClient()
      .from('user_roles').update({ active: newActive }).eq('email', user.email);
    if (error) { this.toast.show('Failed to update status.', 'error'); return; }
    user.active = newActive;
    this.toast.show(`${user.email} marked as ${newActive ? 'Active' : 'Inactive'}`);
  }

  openRolePicker(user: any) {
    if (user.email === this.adminEmail) { this.toast.show('You cannot change your own role.', 'error'); return; }
    this.rolePickerUser = user;
    this.rolePickerSelected = user.role;
  }

  closeRolePicker() { this.rolePickerUser = null; this.rolePickerSelected = ''; }

  async saveRoleChange() {
    if (!this.rolePickerUser) return;
    if (this.rolePickerSelected === this.rolePickerUser.role) { this.closeRolePicker(); return; }
    const user = this.rolePickerUser;
    const newRole = this.rolePickerSelected;
    this.closeRolePicker();
    const { error } = await this.supabase.updateUserRole(user.email, newRole, this.adminEmail);
    if (error) { this.toast.show('Failed to update role.', 'error'); }
    else { this.toast.show(`${user.email} is now ${this.ROLE_LABELS[newRole]}`); await this.loadAll(); }
  }

  openDeleteConfirm(user: any) {
    if (user.email === this.adminEmail) { this.toast.show('You cannot remove yourself.', 'error'); return; }
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
      this.toast.show(`${user.email} removed`);
      await this.loadAll();
    } catch { this.toast.show('Failed to remove user.', 'error'); }
  }

  formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  logout() { this.supabase.getClient().auth.signOut().then(() => this.router.navigate(['/login'])); }
}
