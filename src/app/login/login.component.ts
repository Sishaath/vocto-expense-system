import { Component } from '@angular/core';
import { Router } from '@angular/router';
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
export class LoginComponent {
  email = 'admin@voctotechnologies.com';
  password = '';
  errorMsg = '';
  loading = false;
  selectedRole = 'employee';

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  setRole(role: string) {
    this.selectedRole = role;
    if (role === 'employee') this.email = 'admin@voctotechnologies.com';
    if (role === 'accounts') this.email = 'accounts@voctotechnologies.com';
    if (role === 'md') this.email = 'md@voctotechnologies.com';
    this.password = '';
    this.errorMsg = '';
  }

  async login() {
    this.loading = true;
    this.errorMsg = '';

    const { data, error } = await this.supabase.signIn(
      this.email,
      this.password
    );

    if (error) {
      this.errorMsg = error.message;
      this.loading = false;
      return;
    }

    if (this.selectedRole === 'accounts') {
      this.router.navigate(['/accounts']);
    } else if (this.selectedRole === 'md') {
      this.router.navigate(['/md']);
    } else {
      this.router.navigate(['/dashboard']);
    }

    this.loading = false;
  }}