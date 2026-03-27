import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-submit-claim',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink],
  templateUrl: './submit-claim.component.html',
  styleUrls: ['./submit-claim.component.scss']
})
export class SubmitClaimComponent implements OnInit, OnDestroy {
  editMode = false;
  editClaimId = '';
  existingFileUrl = '';
  existingFileName = '';

  title = '';
  category = 'Travel & Transport';
  amount = 0;
  expenseDate = '';
  vendor = '';
  payMode = 'Company Card';
  description = '';

  selectedFiles: File[] = [];
  previews: { url: SafeResourceUrl | string; isPdf: boolean; name: string }[] = [];
  isDragging = false;
  loading = false;
  errorMsg = '';
  private objectUrls: string[] = [];

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private toastService: ToastService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.editMode = true;
      this.editClaimId = id;
      await this.loadClaim(id);
    }
  }

  async loadClaim(id: string) {
    const { data, error } = await this.supabase.getClaimById(id);
    if (error || !data) { this.errorMsg = 'Could not load claim.'; return; }
    if (data.status !== 'PENDING') {
      this.errorMsg = 'This claim has already been verified and cannot be edited.';
      return;
    }
    this.title = data.title || '';
    this.category = data.category || 'Travel & Transport';
    this.amount = data.amount || 0;
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
    if (!this.title || !this.amount || !this.category) {
      this.errorMsg = 'Please fill in title, amount and category.';
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

      const fileUrl = uploadedPaths.length === 1 ? uploadedPaths[0] : JSON.stringify(uploadedPaths);
      const fileName = uploadedNames.length === 1 ? uploadedNames[0] : JSON.stringify(uploadedNames);

      if (this.editMode) {
        const { error } = await this.supabase.updateClaimDetails(this.editClaimId, {
          title: this.title, category: this.category, amount: this.amount,
          expense_date: this.expenseDate, vendor: this.vendor, pay_mode: this.payMode,
          description: this.description, file_url: fileUrl, file_name: fileName
        });
        if (error) { this.errorMsg = error.message; }
        else {
          this.toastService.show('Claim updated successfully!');
          setTimeout(() => this.router.navigate(['/dashboard']), 1200);
        }
      } else {
        const user = await this.supabase.getClient().auth.getUser();
        const claimNumber = 'VCT-' + Date.now().toString().slice(-6);
        const { error } = await this.supabase.submitClaim({
          claim_number: claimNumber, title: this.title, category: this.category,
          amount: this.amount, expense_date: this.expenseDate, vendor: this.vendor,
          pay_mode: this.payMode, description: this.description,
          file_url: fileUrl, file_name: fileName,
          submitted_by: user.data.user?.id, status: 'PENDING'
        });
        if (error) { this.errorMsg = error.message; }
        else {
          this.toastService.show('Claim submitted successfully!');
          setTimeout(() => this.router.navigate(['/dashboard']), 1200);
        }
      }
    } catch (err) { this.errorMsg = 'Something went wrong. Please try again.'; }
    this.loading = false;
  }
}
