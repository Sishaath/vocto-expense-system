import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';

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
    this.router.navigate(['/dashboard']);
    this.loading = false;
  }

  async sendReset() {
    if (!this.email) { this.errorMsg = 'Please enter your email.'; return; }
    this.loading = true;
    this.errorMsg = '';
    const { error } = await this.supabase.getClient().auth.resetPasswordForEmail(this.email.trim(), {
      redirectTo: `${window.location.origin}/portal/set-password`
    });
    this.loading = false;
    if (error) { this.errorMsg = error.message; return; }
    this.resetSent = true;
  }
}