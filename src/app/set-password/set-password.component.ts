import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-set-password',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './set-password.component.html',
  styleUrls: ['./set-password.component.scss']
})
export class SetPasswordComponent implements OnInit {
  fullName = '';
  password = '';
  confirm = '';
  errorMsg = '';
  loading = false;
  done = false;
  sessionReady = false;
  isReset = false;

  constructor(private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    // Supabase puts the token in the URL hash — listen for the auth state change
    // which fires when the invite/reset token is exchanged for a session.
    this.supabase.getClient().auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY' || event === 'USER_UPDATED') && session) {
        this.sessionReady = true;
        this.errorMsg = '';
        if (event === 'PASSWORD_RECOVERY') this.isReset = true;
      }
    });

    // Also check if session already exists (e.g. page reload)
    const { data } = await this.supabase.getClient().auth.getSession();
    if (data.session) {
      this.sessionReady = true;
    }
  }

  async setPassword() {
    if (!this.isReset && !this.fullName.trim()) {
      this.errorMsg = 'Please enter your full name.'; return;
    }
    if (!this.password || this.password.length < 8) {
      this.errorMsg = 'Password must be at least 8 characters.'; return;
    }
    if (this.password !== this.confirm) {
      this.errorMsg = 'Passwords do not match.'; return;
    }
    this.loading = true;
    this.errorMsg = '';
    const { error } = await this.supabase.getClient().auth.updateUser({
      password: this.password,
      data: { full_name: this.fullName.trim() }
    });
    this.loading = false;
    if (error) { this.errorMsg = error.message; return; }
    this.done = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const email = session?.user?.email || '';
    const role = email ? await this.supabase.getUserRole(email) : null;
    setTimeout(() => {
      if (role === 'accounts') this.router.navigate(['/accounts']);
      else if (role === 'md') this.router.navigate(['/md']);
      else if (role === 'admin') this.router.navigate(['/admin']);
      else this.router.navigate(['/dashboard']);
    }, 2000);
  }
}
