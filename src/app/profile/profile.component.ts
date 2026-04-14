import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  userEmail = '';
  fullName = '';
  editName = '';
  editingName = false;
  savingName = false;
  resetSent = false;
  loading = false;

  get userName() {
    return this.fullName || this.userEmail.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  get userInitial() {
    return this.userName.charAt(0).toUpperCase() || '?';
  }

  get userRole() {
    if (['yogeshwari@voctotechnologies.com', 'accounts@voctotechnologies.com'].includes(this.userEmail)) return 'Accounts Head';
    if (['rrk@voctotechnologies.com', 'md@voctotechnologies.com'].includes(this.userEmail)) return 'Managing Director';
    return 'Employee';
  }

  get backRoute() {
    if (['yogeshwari@voctotechnologies.com', 'accounts@voctotechnologies.com'].includes(this.userEmail)) return '/accounts';
    if (['rrk@voctotechnologies.com', 'md@voctotechnologies.com'].includes(this.userEmail)) return '/md';
    return '/dashboard';
  }

  constructor(private supabase: SupabaseService, private router: Router, private toast: ToastService) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    this.fullName = session.user.user_metadata?.['full_name'] || '';
    this.editName = this.fullName;
  }

  startEditName() { this.editName = this.fullName; this.editingName = true; }
  cancelEditName() { this.editingName = false; }

  async saveName() {
    if (!this.editName.trim()) return;
    this.savingName = true;
    const { error } = await this.supabase.getClient().auth.updateUser({
      data: { full_name: this.editName.trim() }
    });
    this.savingName = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.fullName = this.editName.trim();
    this.editingName = false;
    this.toast.show('Name updated!');
  }

  async sendPasswordReset() {
    this.loading = true;
    const { error } = await this.supabase.getClient().auth.resetPasswordForEmail(this.userEmail, {
      redirectTo: 'https://vocto-expense-system.vercel.app/set-password'
    });
    this.loading = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.resetSent = true;
    this.toast.show('Password reset link sent to your email!');
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
