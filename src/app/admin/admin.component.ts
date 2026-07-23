import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';
import { environment } from '../../environments/environment';
import { AppShellComponent } from '../shared/app-shell/app-shell.component';
import { getRailModules, RailModule } from '../shared/nav-config';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AppShellComponent],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  modules: RailModule[] = getRailModules('admin');
  users: any[] = [];
  authMap: Record<string, { lastLogin: string | null; userId: string; confirmed: boolean }> = {};
  loading = true;
  adminEmail = '';
  activeTab: 'users' | 'audit' | 'settings' = 'users';
  auditLogs: any[] = [];
  auditLoading = false;

  // Bulk role change
  selectedUserEmails: Set<string> = new Set();
  bulkRoleModal = false;
  bulkRole = 'employee';
  get allUsersSelected(): boolean { return this.filtered.length > 0 && this.filtered.every(u => this.selectedUserEmails.has(u.email)); }
  toggleUserSelectAll() {
    if (this.allUsersSelected) this.filtered.forEach(u => this.selectedUserEmails.delete(u.email));
    else this.filtered.forEach(u => this.selectedUserEmails.add(u.email));
    this.selectedUserEmails = new Set(this.selectedUserEmails);
  }
  toggleUserSelect(email: string) {
    if (this.selectedUserEmails.has(email)) this.selectedUserEmails.delete(email);
    else this.selectedUserEmails.add(email);
    this.selectedUserEmails = new Set(this.selectedUserEmails);
  }

  // Company settings (localStorage)
  companySettings = {
    name: 'Vocto Technologies Pvt. Ltd.',
    gstin: '33AAACO0420H1ZH',
    cin: 'U32509TN1994PTC029202',
    address: 'B4, Phase II, MEPZ SEZ, Tambaram, Chennai – 600 045, Tamil Nadu',
    email: 'admin@voctotechnologies.com',
    phone: '+91 99941 78734',
    stateCode: '33'
  };
  settingsSaved = false;
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
    const token = await this.supabase.getAuthToken();
    const [rolesRes, authRes] = await Promise.all([
      this.supabase.getAllUserRoles(),
      fetch(`${environment.apiBaseUrl}/api/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      const token = await this.supabase.getAuthToken();
      const res = await fetch(`${environment.apiBaseUrl}/api/invite-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
    const token = await this.supabase.getAuthToken();
    const res = await fetch(`${environment.apiBaseUrl}/api/invite-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
      const token = await this.supabase.getAuthToken();
      const authInfo = this.authMap[user.email];
      await fetch(`${environment.apiBaseUrl}/api/admin-users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete', userId: authInfo?.userId, email: user.email })
      });
      this.toast.show(`${user.email} removed`);
      await this.loadAll();
    } catch { this.toast.show('Failed to remove user.', 'error'); }
  }

  async switchTab(tab: 'users' | 'audit' | 'settings') {
    this.activeTab = tab;
    if (tab === 'audit' && this.auditLogs.length === 0) await this.loadAuditLogs();
    if (tab === 'settings') this.loadSettings();
  }

  loadSettings() {
    const saved = localStorage.getItem('vocto_company_settings');
    if (saved) try { this.companySettings = { ...this.companySettings, ...JSON.parse(saved) }; } catch {}
  }

  saveSettings() {
    localStorage.setItem('vocto_company_settings', JSON.stringify(this.companySettings));
    this.settingsSaved = true;
    this.toast.show('Company settings saved!', 'success');
    setTimeout(() => this.settingsSaved = false, 3000);
  }

  async confirmBulkRoleChange() {
    if (!this.bulkRole || this.selectedUserEmails.size === 0) return;
    const emails = Array.from(this.selectedUserEmails);
    let ok = 0; let fail = 0;
    for (const email of emails) {
      if (email === this.adminEmail) { fail++; continue; }
      const { error } = await this.supabase.updateUserRole(email, this.bulkRole, this.adminEmail);
      if (error) fail++; else ok++;
    }
    this.selectedUserEmails = new Set();
    this.bulkRoleModal = false;
    if (fail > 0) this.toast.show(`${ok} updated, ${fail} failed (cannot change your own role).`, 'error');
    else this.toast.show(`${ok} user(s) updated to ${this.ROLE_LABELS[this.bulkRole]}`, 'success');
    await this.loadAll();
  }

  async loadAuditLogs() {
    this.auditLoading = true;
    const { data } = await this.supabase.getClient()
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    this.auditLogs = data || [];
    this.auditLoading = false;
  }

  formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatDateTime(d: string) {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  logout() { this.supabase.getClient().auth.signOut().then(() => this.router.navigate(['/login'])); }
}
