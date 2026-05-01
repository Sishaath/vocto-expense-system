import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit {
  email = '';
  password = '';
  errorMsg = '';
  loading = false;
  forgotMode = false;
  resetSent = false;
  timeoutMsg = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    this.timeoutMsg = this.route.snapshot.queryParamMap.get('reason') === 'timeout';
  }

  async login() {
    if (!this.email || !this.password) { this.errorMsg = 'Please enter your email and password.'; return; }
    this.loading = true;
    this.errorMsg = '';
    const { data, error } = await this.supabase.signIn(this.email.trim(), this.password);
    if (error) { this.errorMsg = error.message; this.loading = false; return; }
    const canonicalEmail = data.user?.email || this.email.trim().toLowerCase();
    const token = data.session?.access_token || '';
    let role: string | null = null;
    try {
      const res = await fetch(`${environment.apiBaseUrl}/api/get-role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ email: canonicalEmail })
      });
      const json = await res.json();
      role = json.role || null;
    } catch {}
    // Log login event to audit_logs
    try {
      await this.supabase.logAudit({
        entity_type: 'auth',
        entity_id: canonicalEmail,
        action: 'login',
        performed_by: canonicalEmail,
        notes: `Signed in as ${role || 'employee'}`
      });
    } catch {}

    if (role === 'accounts') this.router.navigate(['/accounts']);
    else if (role === 'md') this.router.navigate(['/md']);
    else if (role === 'admin') this.router.navigate(['/admin']);
    else this.router.navigate(['/dashboard']);
    this.loading = false;
  }

  async sendReset() {
    if (!this.email) { this.errorMsg = 'Please enter your email.'; return; }
    this.loading = true;
    this.errorMsg = '';
    const { error } = await this.supabase.getClient().auth.resetPasswordForEmail(this.email.trim(), {
      redirectTo: `${window.location.origin}/set-password`
    });
    this.loading = false;
    if (error) { this.errorMsg = error.message; return; }
    this.resetSent = true;
  }
}