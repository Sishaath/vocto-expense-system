import { Component } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-submit-claim',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './submit-claim.component.html',
  styleUrls: ['./submit-claim.component.scss']
})
export class SubmitClaimComponent {
  title = '';
  category = 'Travel & Transport';
  amount = 0;
  expenseDate = '';
  vendor = '';
  payMode = 'Company Card';
  description = '';
  selectedFile: File | null = null;
  loading = false;
  errorMsg = '';
  successMsg = '';

  constructor(
    private supabase: SupabaseService,
    private router: Router
  ) {}

  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }

  async submitClaim() {
    if (!this.title || !this.amount || !this.category) {
      this.errorMsg = 'Please fill in title, amount and category.';
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.successMsg = '';
    try {
      const user = await this.supabase.getClient().auth.getUser();
      const userId = user.data.user?.id;
      let fileUrl = '';
      let fileName = '';
      if (this.selectedFile) {
        const claimId = 'VCT-' + Date.now();
        const { data } = await this.supabase.uploadFile(
          claimId, this.selectedFile
        );
        if (data) {
          fileUrl = data.path;
          fileName = this.selectedFile.name;
        }
      }
      const claimNumber = 'VCT-' + Date.now().toString().slice(-6);
      const { error } = await this.supabase.submitClaim({
        claim_number: claimNumber,
        title: this.title,
        category: this.category,
        amount: this.amount,
        expense_date: this.expenseDate,
        vendor: this.vendor,
        pay_mode: this.payMode,
        description: this.description,
        file_url: fileUrl,
        file_name: fileName,
        submitted_by: userId,
        status: 'PENDING'
      });
      if (error) {
        this.errorMsg = error.message;
      } else {
        this.successMsg = '✓ Claim submitted successfully!';
        setTimeout(() => this.router.navigate(['/dashboard']), 1500);
      }
    } catch (err) {
      this.errorMsg = 'Something went wrong. Please try again.';
    }
    this.loading = false;
  }
}