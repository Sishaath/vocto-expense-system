import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';
import { SharedSidebarComponent } from '../shared-sidebar/shared-sidebar.component';

@Component({
  selector: 'app-submit-claim',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, SharedSidebarComponent],
  templateUrl: './submit-claim.component.html',
  styleUrls: ['./submit-claim.component.scss']
})
export class SubmitClaimComponent implements OnInit, OnDestroy {
  editMode = false;
  editClaimId = '';
  editClaimNumber = '';
  editClaimEmployeeEmail = '';
  existingFileUrl = '';
  existingFileName = '';
  fromTemplateId: string | null = null;
  private templateData: any = null;

  categories: string[] = ['Travel & Accommodation', 'Meals & Entertainment', 'Office Supplies', 'Software / Subscriptions', 'Training & Conference', 'Vendor Invoice', 'Miscellaneous'];

  title = '';
  category = 'Travel & Accommodation';
  amount: number | null = null;
  expenseDate = '';
  vendor = '';
  payMode = 'Company Card';
  description = '';

  selectedFiles: File[] = [];
  previews: { url: SafeResourceUrl | string; isPdf: boolean; name: string }[] = [];
  isDragging = false;
  loading = false;
  errorMsg = '';
  formSubmitted = false;
  private objectUrls: string[] = [];

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    const cats = await this.supabase.getActiveCategories();
    if (cats.length) this.categories = cats;
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editMode = true;
      this.editClaimId = id;
      await this.loadClaim(id);
    }

    // Pre-fill from recurring template if navigated with state
    const nav = this.router.getCurrentNavigation?.() ?? null;
    const templateData = history.state?.templateData;
    if (templateData && !this.editMode) {
      this.title = templateData.title || '';
      this.category = templateData.category || 'Travel & Accommodation';
      this.amount = templateData.amount || null;
      this.vendor = templateData.vendor || '';
      this.payMode = templateData.pay_mode || 'Company Card';
      this.description = templateData.description || '';
      this.fromTemplateId = templateData.id || null;
      this.templateData = templateData;
    }
  }

  async loadClaim(id: string) {
    const { data, error } = await this.supabase.getClaimById(id);
    if (error || !data) { this.errorMsg = 'Could not load claim.'; return; }
    if (data.status !== 'PENDING') {
      this.errorMsg = 'This claim has already been verified and cannot be edited.';
      return;
    }
    this.editClaimNumber = data.claim_number || '';
    this.editClaimEmployeeEmail = data.employee_email || '';
    this.title = data.title || '';
    this.category = data.category || 'Travel & Accommodation';
    this.amount = data.amount || null;
    this.expenseDate = data.expense_date || '';
    this.vendor = data.vendor || '';
    this.payMode = data.pay_mode || 'Company Card';
    this.description = data.description || '';
    this.existingFileUrl = data.file_url || '';
    this.existingFileName = data.file_name || '';
    // Show existing files as previews
    if (this.existingFileUrl) {
      const urls = this.parseJsonOrSingle(this.existingFileUrl);
      const names = this.parseJsonOrSingle(this.existingFileName);
      urls.forEach((u, i) => {
        const publicUrl = this.supabase.getFileUrl(u);
        const ext = (names[i] || u).split('.').pop()?.toLowerCase() || '';
        const isPdf = ext === 'pdf';
        this.previews.push({
          url: isPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(publicUrl) : publicUrl,
          isPdf,
          name: names[i] || u
        });
      });
    }
  }

  parseJsonOrSingle(val: string): string[] {
    try { const p = JSON.parse(val); return Array.isArray(p) ? p : [val]; } catch { return [val]; }
  }

  onFileSelected(event: any) {
    const files: File[] = Array.from(event.target.files);
    this.addFiles(files);
  }

  onDragOver(e: DragEvent) { e.preventDefault(); this.isDragging = true; }
  onDragLeave(e: DragEvent) { this.isDragging = false; }
  onDrop(e: DragEvent) {
    e.preventDefault();
    this.isDragging = false;
    const files: File[] = Array.from(e.dataTransfer?.files || []);
    this.addFiles(files);
  }

  addFiles(files: File[]) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    for (const file of files) {
      if (!allowed.includes(file.type)) { this.toastService.show(`${file.name}: unsupported type`, 'error'); continue; }
      if (file.size > 10 * 1024 * 1024) {
        this.toastService.show(`${file.name} exceeds the 10MB file size limit`, 'error');
        continue;
      }
      this.selectedFiles.push(file);
      const objUrl = URL.createObjectURL(file);
      this.objectUrls.push(objUrl);
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isPdf = ext === 'pdf';
      this.previews.push({
        url: isPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(objUrl) : objUrl,
        isPdf,
        name: file.name
      });
    }
  }

  removeFile(index: number) {
    // Only remove new files (existing ones are at start in edit mode)
    const existingCount = this.editMode ? this.parseJsonOrSingle(this.existingFileUrl || '[]').filter(u => u).length : 0;
    if (index < existingCount) return; // can't remove existing via this UI
    const newFileIndex = index - existingCount;
    this.selectedFiles.splice(newFileIndex, 1);
    if (this.objectUrls[newFileIndex]) URL.revokeObjectURL(this.objectUrls[newFileIndex]);
    this.objectUrls.splice(newFileIndex, 1);
    this.previews.splice(index, 1);
  }

  ngOnDestroy() {
    this.objectUrls.forEach(u => URL.revokeObjectURL(u));
  }

  async submitClaim() {
    this.formSubmitted = true;
    const hasFile = this.previews.length > 0 || (this.editMode && !!this.existingFileUrl);
    const missing: string[] = [];
    if (!this.title.trim()) missing.push('Title');
    if (!this.amount || this.amount <= 0) missing.push('Amount');
    if (!this.expenseDate) missing.push('Expense Date');
    if (!this.vendor.trim()) missing.push('Vendor');
    if (!this.description.trim()) missing.push('Description');
    if (!hasFile) missing.push('Supporting Document');
    if (missing.length > 0) {
      this.errorMsg = `Please fill in: ${missing.join(', ')}.`;
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    try {
      // Upload new files
      const uploadedPaths: string[] = [];
      const uploadedNames: string[] = [];

      // In edit mode, start with existing files
      if (this.editMode && this.existingFileUrl) {
        const existingUrls = this.parseJsonOrSingle(this.existingFileUrl);
        const existingNames = this.parseJsonOrSingle(this.existingFileName);
        uploadedPaths.push(...existingUrls);
        uploadedNames.push(...existingNames);
      }

      for (const file of this.selectedFiles) {
        const claimId = 'VCT-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        const { data, error: uploadError } = await this.supabase.uploadFile(claimId, file);
        if (uploadError) {
          this.errorMsg = 'File upload failed: ' + uploadError.message;
          this.loading = false;
          return;
        }
        if (data) { uploadedPaths.push(data.path); uploadedNames.push(file.name); }
      }

      const fileUrl = uploadedPaths.length === 0 ? '' : uploadedPaths.length === 1 ? uploadedPaths[0] : JSON.stringify(uploadedPaths);
      const fileName = uploadedNames.length === 0 ? '' : uploadedNames.length === 1 ? uploadedNames[0] : JSON.stringify(uploadedNames);

      if (this.editMode) {
        const { error } = await this.supabase.updateClaimDetails(this.editClaimId, {
          title: this.title, category: this.category, amount: this.amount,
          expense_date: this.expenseDate, vendor: this.vendor, pay_mode: this.payMode,
          description: this.description, file_url: fileUrl, file_name: fileName
        });
        if (error) { this.errorMsg = error.message; }
        else {
          this.toastService.show('Claim updated successfully!');
          fetch('/api/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
            body: JSON.stringify({ event: 'submitted', claimNumber: this.editClaimNumber, claimTitle: this.title, amount: this.amount, employeeEmail: this.editClaimEmployeeEmail, submittedBy: this.editClaimEmployeeEmail })
          }).catch(() => {});
          setTimeout(() => this.router.navigate(['/dashboard']), 1200);
        }
      } else {
        const user = await this.supabase.getClient().auth.getUser();
        const year = new Date().getFullYear();
        const { data: lastClaims } = await this.supabase.getClient()
          .from('claims')
          .select('claim_number')
          .like('claim_number', `VT${year}%`)
          .order('claim_number', { ascending: false })
          .limit(1);
        let seq = 1;
        if (lastClaims && lastClaims.length > 0) {
          const num = parseInt(lastClaims[0].claim_number.replace(`VT${year}`, ''));
          if (!isNaN(num)) seq = num + 1;
        }
        const claimNumber = `VT${year}${String(seq).padStart(3, '0')}`;
        const employeeEmail = user.data.user?.email || '';
        const employeeName = user.data.user?.user_metadata?.['full_name'] || '';
        const { error } = await this.supabase.submitClaim({
          claim_number: claimNumber, title: this.title, category: this.category,
          amount: this.amount, expense_date: this.expenseDate, vendor: this.vendor,
          pay_mode: this.payMode, description: this.description,
          file_url: fileUrl, file_name: fileName,
          submitted_by: user.data.user?.id, employee_email: employeeEmail,
          employee_name: employeeName, status: 'PENDING'
        });
        if (error) { this.errorMsg = error.message; }
        else {
          this.toastService.show('Claim submitted successfully!');
          await this.supabase.logAudit({ entity_type: 'claim', entity_id: claimNumber, entity_ref: claimNumber, action: 'submitted', performed_by: employeeEmail, new_values: { title: this.title, amount: this.amount, category: this.category } });
          const accEmails = await this.supabase.getUsersByRole('accounts');
          if (accEmails.length) {
            await this.supabase.createNotifications(accEmails, { title: `New voucher submitted — ${claimNumber}`, body: `${this.title} · ₹${Number(this.amount).toLocaleString('en-IN')} by ${employeeEmail}`, entity_type: 'claim', entity_id: claimNumber, entity_ref: claimNumber });
          }
          // Advance recurring template due date
          if (this.fromTemplateId) {
            const freq = this.templateData?.frequency || 'monthly';
            const due = new Date(this.templateData?.next_due_date || new Date());
            if (freq === 'monthly') due.setMonth(due.getMonth() + 1);
            else if (freq === 'quarterly') due.setMonth(due.getMonth() + 3);
            else due.setFullYear(due.getFullYear() + 1);
            await this.supabase.advanceTemplateDueDate(this.fromTemplateId, due.toISOString().split('T')[0]);
          }
          fetch('/api/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
            body: JSON.stringify({ event: 'submitted', claimNumber, claimTitle: this.title, amount: this.amount, employeeEmail, submittedBy: employeeEmail })
          }).catch(() => {});
          fetch('/api/notify', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-notify-secret': 'vocto-notify-2024' },
            body: JSON.stringify({ event: 'receipt', claimNumber, claimTitle: this.title, amount: this.amount, employeeEmail })
          }).catch(() => {});
          setTimeout(() => this.router.navigate(['/dashboard']), 1200);
        }
      }
    } catch (err) { this.errorMsg = 'Something went wrong. Please try again.'; }
    this.loading = false;
  }
}
