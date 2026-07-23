import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';
import { SharedSidebarComponent } from '../shared-sidebar/shared-sidebar.component';
import { AppShellComponent } from '../shared/app-shell/app-shell.component';
import { getRailModules, RailModule } from '../shared/nav-config';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-advance-requisition',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, SharedSidebarComponent, AppShellComponent],
  templateUrl: './advance-requisition.component.html',
  styleUrls: ['./advance-requisition.component.scss']
})
export class AdvanceRequisitionComponent implements OnInit {
  // View mode
  viewMode: 'new' | 'view' = 'new';
  requisitionId = '';
  requisition: any = null;

  // Form fields
  purpose = '';
  advance_amount: number | null = null;
  vendor_payee = '';
  expected_date = '';
  description = '';

  // Update actuals
  actual_amount: number | null = null;
  proofFile: File | null = null;
  proofFileName = '';

  loading = false;
  saving = false;
  errorMsg = '';
  userEmail = '';
  role: string | null = null;
  modules: RailModule[] = [];
  userId = '';

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    this.userEmail = session?.user?.email || '';
    this.role = await this.supabase.getUserRole(this.userEmail);
    this.modules = getRailModules(this.role);
    this.userId = session?.user?.id || '';

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.viewMode = 'view';
      this.requisitionId = id;
      await this.loadRequisition(id);
    }
  }

  async loadRequisition(id: string) {
    this.loading = true;
    const { data, error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .select('*')
      .eq('id', id)
      .single();
    this.loading = false;
    if (error || !data) { this.errorMsg = 'Could not load requisition.'; return; }
    this.requisition = data;
  }

  async submitRequisition() {
    if (!this.purpose || !this.advance_amount || this.advance_amount <= 0) {
      this.errorMsg = 'Please fill in Purpose and Advance Amount.';
      return;
    }
    this.saving = true;
    this.errorMsg = '';
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .insert({
        purpose: this.purpose,
        advance_amount: this.advance_amount,
        vendor_payee: this.vendor_payee || null,
        expected_date: this.expected_date || null,
        description: this.description || null,
        submitted_by: this.userEmail,
        status: 'PENDING'
      });
    this.saving = false;
    if (error) { this.errorMsg = error.message; return; }
    this.toast.show('Advance requisition submitted!', 'success');
    // Notify accounts team
    try {
      const accountsUsers = await this.supabase.getUsersByRole('accounts');
      const recipients = accountsUsers.map((u: any) => u.email).filter(Boolean);
      if (recipients.length) {
        await this.supabase.createNotifications(accountsUsers, {
          title: `Advance requisition submitted — ${this.purpose}`,
          body: `₹${Number(this.advance_amount).toLocaleString('en-IN')} by ${this.userEmail}`,
          entity_type: 'advance_requisition', entity_id: '', entity_ref: ''
        });
        const token = await this.supabase.getAuthToken();
        fetch(`${environment.apiBaseUrl}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ type: 'advance_submitted', to: recipients[0], purpose: this.purpose, amount: this.advance_amount, submittedBy: this.userEmail })
        }).catch(() => {});
      }
    } catch { /* non-critical */ }
    setTimeout(() => this.router.navigate(['/dashboard']), 1200);
  }

  onProofSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;
    this.proofFile = file;
    this.proofFileName = file.name;
  }

  async updateActuals() {
    if (!this.actual_amount || this.actual_amount <= 0) {
      this.errorMsg = 'Please enter the actual amount spent.';
      return;
    }
    this.saving = true;
    this.errorMsg = '';
    let proofUrl = '';
    let proofName = '';
    if (this.proofFile) {
      const ext = this.proofFile.name.split('.').pop();
      const path = `advance-proof/${this.requisitionId}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await this.supabase.getClient()
        .storage.from('claim-documents')
        .upload(path, this.proofFile, { upsert: true });
      if (uploadError) { this.errorMsg = 'File upload failed: ' + uploadError.message; this.saving = false; return; }
      proofUrl = uploadData?.path || '';
      proofName = this.proofFile.name;
    }
    const updates: any = {
      actual_amount: this.actual_amount,
      status: 'ADVANCE_GIVEN'
    };
    if (proofUrl) { updates.actual_proof_url = proofUrl; updates.actual_proof_name = proofName; }
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update(updates)
      .eq('id', this.requisitionId);
    this.saving = false;
    if (error) { this.errorMsg = error.message; return; }
    this.toast.show('Actuals updated — pending accounts verification.', 'success');
    await this.loadRequisition(this.requisitionId);
  }

  onActualChange() {
    // trigger change detection for calculated fields
  }

  get balanceToReturn(): number {
    const adv = this.requisition?.advance_amount ?? this.advance_amount ?? 0;
    if (this.actual_amount != null && this.actual_amount < adv) {
      return adv - this.actual_amount;
    }
    return 0;
  }

  get additionalAmount(): number {
    const adv = this.requisition?.advance_amount ?? this.advance_amount ?? 0;
    if (this.actual_amount != null && this.actual_amount > adv) {
      return this.actual_amount - adv;
    }
    return 0;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      'PENDING': 'Pending Review',
      'ACCOUNTS_APPROVED': 'Sent to MD',
      'MD_APPROVED': 'MD Approved — Advance Pending',
      'ADVANCE_GIVEN': 'Advance Given — Update Actuals',
      'SETTLED': 'Settled',
      'REJECTED': 'Rejected'
    };
    return map[status] || status;
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
