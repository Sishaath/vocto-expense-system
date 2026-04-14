import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterModule, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService, RecurringTemplate } from '../supabase.service';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';
import { ToastService } from '../shared/toast.service';
import { NotifBellComponent } from '../notif-bell/notif-bell.component';
import { AccountsSidebarComponent } from '../accounts-sidebar/accounts-sidebar.component';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterModule, DatePipe, ClaimDetailComponent, FormsModule, NotifBellComponent, AccountsSidebarComponent],
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.scss']
})
export class AccountsComponent implements OnInit {
  allClaims: any[] = [];
  allPOs: any[] = [];
  sidebarOpen = false;

  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebar() { this.sidebarOpen = false; }
  selectedClaim: any = null;
  selectedMonth = 'all';
  activeSection: string = 'all';
  rejectModalOpen = false;
  rejectingClaimId: string | null = null;
  rejectionReason = '';
  payConfirmOpen = false;
  payConfirmClaimId: string | null = null;
  payMode = 'Bank Transfer';
  payRef = '';
  payDate = new Date().toISOString().split('T')[0];
  readonly PAY_MODES = ['Bank Transfer', 'UPI', 'Cash', 'Cheque', 'NEFT', 'RTGS', 'IMPS'];
  poRejectModalOpen = false;
  rejectingPOId: string | null = null;
  poRejectionReason = '';
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;
  viewerFiles: { url: SafeResourceUrl | string; name: string; isPdf: boolean }[] = [];
  loading = true;

  // Advance Requisitions
  allRequisitions: any[] = [];
  advanceGiveModalOpen = false;
  advanceGivingId: string | null = null;
  advancePayMode = 'Bank Transfer';
  advancePayRef = '';
  advancePayDate = new Date().toISOString().split('T')[0];

  // Fixed Recurring Expenses
  recurringExpenses: any[] = [];
  showAddRecurring = false;
  newRecurring: { category: string; amount: number; month: string; reference: string; notes: string } = {
    category: 'EB', amount: 0, month: '', reference: '', notes: ''
  };

  // Date filter
  filterFrom = '';
  filterTo = '';
  searchQuery = '';

  // Recurring expenses templates
  allTemplates: RecurringTemplate[] = [];
  categories: string[] = [];
  templateModalOpen = false;
  editingTemplate: Partial<RecurringTemplate> | null = null;
  savingTemplate = false;
  generatingId: string | null = null;
  templateForm: { title: string; category: string; amount: number; vendor: string; pay_mode: string; description: string; frequency: 'monthly' | 'quarterly' | 'yearly'; next_due_date: string } = {
    title: '', category: '', amount: 0, vendor: '', pay_mode: 'Bank Transfer', description: '', frequency: 'monthly', next_due_date: ''
  };
  readonly FREQUENCIES = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' }
  ];

  get availableMonths(): { key: string; label: string }[] {
    const seen = new Set<string>();
    const months: { key: string; label: string }[] = [];
    for (const c of this.allClaims) {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) {
        seen.add(key);
        months.push({ key, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });
      }
    }
    return months;
  }

  private matchesMonth(c: any) {
    if (this.selectedMonth === 'all') return true;
    const d = new Date(c.created_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === this.selectedMonth;
  }

  get pendingClaims() {
    return this.allClaims.filter(c => c.status === 'PENDING' && this.matchesMonth(c));
  }
  get verifiedClaims() {
    return this.allClaims.filter(c => c.status === 'VERIFIED' && this.matchesMonth(c));
  }
  get approvedClaims() {
    return this.allClaims.filter(c => c.status === 'MD_APPROVED' && this.matchesMonth(c));
  }
  get paidClaims() {
    return this.allClaims.filter(c => c.status === 'PAID');
  }
  get rejectedClaims() {
    return this.allClaims.filter(c => c.status === 'REJECTED' && this.matchesMonth(c));
  }
  get currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  get thisMonthPaidClaims() {
    return this.allClaims.filter(c => {
      if (c.status !== 'PAID') return false;
      const d = new Date(c.payment_date || c.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === this.currentMonthKey;
    });
  }
  get totalPaid() {
    return this.thisMonthPaidClaims.reduce((sum, c) => sum + c.amount, 0);
  }
  get totalAdvanceReleased() {
    return this.allRequisitions
      .filter(r => ['ADVANCE_GIVEN','SETTLED'].includes(r.status) && (() => {
        const d = new Date(r.updated_at || r.created_at);
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === this.currentMonthKey;
      })())
      .reduce((sum, r) => sum + (r.advance_amount || 0), 0);
  }
  get totalReleasedThisMonth() {
    return this.totalPaid + this.totalAdvanceReleased;
  }
  get currentMonthLabel() {
    return new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  get monthWisePayments(): { key: string; label: string; amount: number; count: number }[] {
    const map = new Map<string, { amount: number; count: number }>();
    for (const c of this.allClaims.filter(c => c.status === 'PAID')) {
      const d = new Date(c.payment_date || c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
      const existing = map.get(key) || { amount: 0, count: 0 };
      map.set(key, { amount: existing.amount + c.amount, count: existing.count + 1 });
    }
    return Array.from(map.entries())
      .map(([key, val]) => {
        const [yr, mo] = key.split('-');
        const label = new Date(+yr, +mo-1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
        return { key, label, ...val };
      })
      .sort((a, b) => b.key.localeCompare(a.key));
  }

  get pendingPOs() {
    return this.allPOs.filter(p => p.status === 'pending');
  }

  get verifiedPOs() {
    return this.allPOs.filter(p => p.status === 'acc_verified');
  }
  get selectedMonthLabel() {
    return this.availableMonths.find(m => m.key === this.selectedMonth)?.label || 'All';
  }

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private toast: ToastService
  ) {}

  userEmail = '';
  fullName = '';
  get userName() { return this.fullName || this.userEmail.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  get userInitial() { return this.userName.charAt(0).toUpperCase() || 'A'; }

  async ngOnInit() {
    this.loading = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    this.userEmail = session?.user?.email || '';
    this.fullName = session?.user?.user_metadata?.['full_name'] || '';
    const { data } = await this.supabase.getClaims();
    if (data) this.allClaims = data;
    const { data: poData } = await this.supabase.getPurchaseOrders();
    if (poData) this.allPOs = poData;
    this.categories = await this.supabase.getActiveCategories();
    await this.loadTemplates();
    await this.loadRequisitions();
    await this.loadRecurring();
    this.loading = false;
    // Auto-open claim from notification click
    const openRef = this.route.snapshot.queryParamMap.get('open');
    if (openRef) {
      const claim = this.allClaims.find(c => c.claim_number === openRef || c.id === openRef);
      if (claim) { this.selectedClaim = claim; this.activeSection = 'all'; }
    }
  }

  slaHours(claim: any): number {
    return Math.floor((Date.now() - new Date(claim.created_at).getTime()) / 36e5);
  }

  async verifyPO(id: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const po = this.allPOs.find(p => p.id === id);
    await this.supabase.getClient()
      .from('purchase_orders')
      .update({ status: 'acc_verified', acc_verified_by: session?.user?.email || '' })
      .eq('id', id);
    await this.supabase.logAudit({ entity_type: 'purchase_order', entity_id: id, entity_ref: po?.po_number, action: 'acc_verified', performed_by: session?.user?.email || '', old_values: { status: po?.status }, new_values: { status: 'acc_verified' } });
    this.toast.show('PO verified and sent to MD!', 'success');
    await this.ngOnInit();
  }

  async verifyClaim(id: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const claim = this.allClaims.find(c => c.id === id);
    const verifiedByName = session?.user?.user_metadata?.['full_name'] || session?.user?.email || '';
    const { error } = await this.supabase.getClient()
      .from('claims')
      .update({ status: 'VERIFIED', verified_by: session?.user?.email || '', verified_by_name: verifiedByName })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'claim', entity_id: id, entity_ref: claim?.claim_number, action: 'verified', performed_by: session?.user?.email || '', old_values: { status: 'PENDING' }, new_values: { status: 'VERIFIED' } });
    // Auto-clear the "submitted" notification for this claim from accounts inbox
    await this.supabase.markNotificationsReadForEntity(session?.user?.email || '', claim?.claim_number || id);
    // Notify MD
    await this.supabase.createNotifications(
      ['rrk@voctotechnologies.com', 'md@voctotechnologies.com'],
      { title: `Voucher ready for approval — ${claim?.claim_number}`, body: `${claim?.title} · ₹${Number(claim?.amount).toLocaleString('en-IN')}`, entity_type: 'claim', entity_id: claim?.id, entity_ref: claim?.claim_number }
    );
    this.toast.show('Claim verified and sent to MD!', 'success');
    if (claim) {
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'verified', claimNumber: claim.claim_number, claimTitle: claim.title, amount: claim.amount, submittedBy: claim.employee_email || claim.submitted_by })
      }).catch(() => {});
    }
    await this.ngOnInit();
  }

  openRejectModal(id: string) {
    this.rejectingClaimId = id;
    this.rejectionReason = '';
    this.rejectModalOpen = true;
  }

  cancelReject() {
    this.rejectModalOpen = false;
    this.rejectingClaimId = null;
    this.rejectionReason = '';
  }

  async confirmReject() {
    if (!this.rejectingClaimId || !this.rejectionReason.trim()) return;
    await this.rejectClaim(this.rejectingClaimId, this.rejectionReason.trim());
    this.cancelReject();
  }

  show(section: string): boolean { return this.activeSection === 'all' || this.activeSection === section; }

  async rejectClaim(id: string, reason: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const claim = this.allClaims.find(c => c.id === id);
    const { error } = await this.supabase.getClient()
      .from('claims')
      .update({ status: 'REJECTED', rejection_reason: reason })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'claim', entity_id: id, entity_ref: claim?.claim_number, action: 'rejected', performed_by: session?.user?.email || '', old_values: { status: claim?.status }, new_values: { status: 'REJECTED', rejection_reason: reason } });
    this.toast.show('Claim rejected.', 'warning');
    if (claim?.employee_email) {
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'rejected', claimNumber: claim.claim_number, claimTitle: claim.title, amount: claim.amount, employeeEmail: claim.employee_email })
      }).catch(() => {});
    }
    await this.ngOnInit();
  }

  openPayConfirm(id: string) {
    this.payConfirmClaimId = id;
    this.payMode = 'Bank Transfer';
    this.payRef = '';
    this.payDate = new Date().toISOString().split('T')[0];
    this.payConfirmOpen = true;
  }

  cancelPayConfirm() {
    this.payConfirmOpen = false;
    this.payConfirmClaimId = null;
  }

  async confirmPay() {
    if (!this.payConfirmClaimId) return;
    if (this.payMode !== 'Cash' && !this.payRef.trim()) {
      this.toast.show('Enter transaction reference', 'error'); return;
    }
    await this.releasePay(this.payConfirmClaimId);
    this.cancelPayConfirm();
  }

  async releasePay(id: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const claim = this.allClaims.find(c => c.id === id);
    const paidByName = session?.user?.user_metadata?.['full_name'] || session?.user?.email || '';
    const { error } = await this.supabase.getClient()
      .from('claims')
      .update({ status: 'PAID', payment_mode: this.payMode, payment_ref: this.payRef.trim(), payment_date: this.payDate, paid_by: session?.user?.email || '', paid_by_name: paidByName })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'claim', entity_id: id, entity_ref: claim?.claim_number, action: 'paid', performed_by: session?.user?.email || '', old_values: { status: 'MD_APPROVED' }, new_values: { status: 'PAID' } });
    await this.supabase.markNotificationsReadForEntity(session?.user?.email || '', claim?.id || id);
    this.toast.show('Payment released successfully!', 'success');
    if (claim?.employee_email) {
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'paid', claimNumber: claim.claim_number, claimTitle: claim.title, amount: claim.amount, employeeEmail: claim.employee_email })
      }).catch(() => {});
    }
    await this.ngOnInit();
  }

  openPORejectModal(id: string) {
    this.rejectingPOId = id;
    this.poRejectionReason = '';
    this.poRejectModalOpen = true;
  }

  cancelPOReject() {
    this.poRejectModalOpen = false;
    this.rejectingPOId = null;
    this.poRejectionReason = '';
  }

  async confirmPOReject() {
    if (!this.rejectingPOId || !this.poRejectionReason.trim()) return;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const po = this.allPOs.find(p => p.id === this.rejectingPOId);
    await this.supabase.getClient()
      .from('purchase_orders')
      .update({ status: 'rejected', rejection_reason: this.poRejectionReason.trim() })
      .eq('id', this.rejectingPOId);
    await this.supabase.logAudit({ entity_type: 'purchase_order', entity_id: this.rejectingPOId, entity_ref: po?.po_number, action: 'rejected', performed_by: session?.user?.email || '', old_values: { status: po?.status }, new_values: { status: 'rejected', rejection_reason: this.poRejectionReason.trim() } });
    this.toast.show('PO rejected.', 'warning');
    this.cancelPOReject();
    await this.ngOnInit();
  }

  openDetail(claim: any) {
    this.selectedClaim = claim;
  }

  closeDetail() {
    this.selectedClaim = null;
  }

  openViewer(claim: any) {
    if (!claim.file_url) return;
    let paths: string[] = [];
    let names: string[] = [];
    try {
      const p = JSON.parse(claim.file_url);
      paths = Array.isArray(p) ? p : [claim.file_url];
    } catch { paths = [claim.file_url]; }
    try {
      const n = JSON.parse(claim.file_name);
      names = Array.isArray(n) ? n : [claim.file_name];
    } catch { names = [claim.file_name || 'Attachment']; }

    this.viewerFiles = paths.map((path, i) => {
      const name = names[i] || path.split('/').pop() || 'Attachment';
      const ext = name.split('.').pop()?.toLowerCase() || '';
      const isPdf = ext === 'pdf';
      const url = this.supabase.getFileUrl(path);
      return { url: isPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : url, name, isPdf };
    });

    // If single file open directly, else show file list
    if (this.viewerFiles.length === 1) {
      this.viewerUrl = this.viewerFiles[0].url;
      this.viewerName = this.viewerFiles[0].name;
      this.viewerIsPdf = this.viewerFiles[0].isPdf;
    } else {
      this.viewerUrl = '';
      this.viewerName = '';
      this.viewerIsPdf = false;
    }
    this.viewerOpen = true;
  }

  openSingleFile(file: { url: SafeResourceUrl | string; name: string; isPdf: boolean }) {
    this.viewerUrl = file.url;
    this.viewerName = file.name;
    this.viewerIsPdf = file.isPdf;
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerUrl = '';
    this.viewerFiles = [];
  }

  async loadTemplates() {
    const { data } = await this.supabase.getAllTemplates();
    if (data) this.allTemplates = data;
  }

  dueStatus(t: RecurringTemplate): 'overdue' | 'today' | 'soon' | 'upcoming' {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(t.next_due_date); due.setHours(0, 0, 0, 0);
    const diff = Math.floor((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return 'overdue';
    if (diff === 0) return 'today';
    if (diff <= 7) return 'soon';
    return 'upcoming';
  }

  daysUntilDue(t: RecurringTemplate): number {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(t.next_due_date); due.setHours(0, 0, 0, 0);
    return Math.floor((due.getTime() - today.getTime()) / 86400000);
  }

  openTemplateModal(template?: RecurringTemplate) {
    if (template) {
      this.editingTemplate = template;
      this.templateForm = {
        title: template.title, category: template.category, amount: template.amount,
        vendor: template.vendor || '', pay_mode: template.pay_mode,
        description: template.description || '', frequency: template.frequency,
        next_due_date: template.next_due_date
      };
    } else {
      this.editingTemplate = null;
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
      this.templateForm = {
        title: '', category: this.categories[0] || '', amount: 0, vendor: '',
        pay_mode: 'Bank Transfer', description: '', frequency: 'monthly',
        next_due_date: next.toISOString().split('T')[0]
      };
    }
    this.templateModalOpen = true;
  }

  closeTemplateModal() {
    this.templateModalOpen = false;
    this.editingTemplate = null;
  }

  async saveTemplate() {
    if (!this.templateForm.title.trim() || !this.templateForm.amount) {
      this.toast.show('Title and amount are required.', 'error'); return;
    }
    this.savingTemplate = true;
    const payload: Partial<RecurringTemplate> = {
      ...(this.editingTemplate?.id ? { id: this.editingTemplate.id } : {}),
      title: this.templateForm.title.trim(),
      category: this.templateForm.category,
      amount: this.templateForm.amount,
      vendor: this.templateForm.vendor.trim() || undefined,
      pay_mode: this.templateForm.pay_mode,
      description: this.templateForm.description.trim() || undefined,
      frequency: this.templateForm.frequency,
      next_due_date: this.templateForm.next_due_date,
      created_by: this.userEmail,
      active: true
    };
    const { error } = await this.supabase.upsertTemplate(payload);
    if (error) { this.toast.show(error.message, 'error'); this.savingTemplate = false; return; }
    this.toast.show(this.editingTemplate?.id ? 'Template updated.' : 'Recurring expense added.', 'success');
    this.savingTemplate = false;
    this.closeTemplateModal();
    await this.loadTemplates();
  }

  async toggleTemplate(t: RecurringTemplate) {
    await this.supabase.getClient().from('recurring_templates').update({ active: !t.active }).eq('id', t.id!);
    await this.loadTemplates();
  }

  async deleteTemplate(t: RecurringTemplate) {
    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    await this.supabase.deleteTemplate(t.id!);
    this.toast.show('Template deleted.', 'warning');
    await this.loadTemplates();
  }

  async generateVoucher(t: RecurringTemplate) {
    this.generatingId = t.id!;
    const year = new Date().getFullYear();
    const { data: lastClaims } = await this.supabase.getClient()
      .from('claims').select('claim_number').like('claim_number', `VT${year}%`)
      .order('claim_number', { ascending: false }).limit(1);
    let seq = 1;
    if (lastClaims && lastClaims.length > 0) {
      const num = parseInt(lastClaims[0].claim_number.replace(`VT${year}`, ''));
      if (!isNaN(num)) seq = num + 1;
    }
    const claimNumber = `VT${year}${String(seq).padStart(3, '0')}`;
    const { error } = await this.supabase.submitClaim({
      claim_number: claimNumber, title: t.title, category: t.category,
      amount: t.amount, expense_date: t.next_due_date, vendor: t.vendor || null,
      pay_mode: t.pay_mode, description: t.description || null,
      employee_email: this.userEmail, submitted_by: this.userEmail, status: 'PENDING'
    });
    if (error) { this.toast.show(error.message, 'error'); this.generatingId = null; return; }
    const due = new Date(t.next_due_date);
    if (t.frequency === 'monthly') due.setMonth(due.getMonth() + 1);
    else if (t.frequency === 'quarterly') due.setMonth(due.getMonth() + 3);
    else due.setFullYear(due.getFullYear() + 1);
    const newDate = due.toISOString().split('T')[0];
    await this.supabase.getClient().from('recurring_templates')
      .update({ next_due_date: newDate, last_generated_at: new Date().toISOString() })
      .eq('id', t.id!);
    await this.supabase.logAudit({ entity_type: 'claim', entity_id: claimNumber, entity_ref: claimNumber, action: 'submitted', performed_by: this.userEmail, new_values: { title: t.title, amount: t.amount, category: t.category, source: 'recurring' } });
    await this.supabase.createNotifications(
      ['yogeshwari@voctotechnologies.com', 'accounts@voctotechnologies.com'],
      { title: `Recurring voucher — ${claimNumber}`, body: `${t.title} · ₹${Number(t.amount).toLocaleString('en-IN')}`, entity_type: 'claim', entity_id: claimNumber, entity_ref: claimNumber }
    );
    this.toast.show(`Voucher ${claimNumber} generated!`, 'success');
    this.generatingId = null;
    await this.ngOnInit();
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }

  // ── Advance Requisitions ──────────────────────────────────────────────────
  poStatusLabel(status: string): string {
    const map: any = { draft: 'Draft', pending: 'Pending', acc_verified: 'Verified', md_approved: 'Approved', rejected: 'Rejected' };
    return map[status] || status;
  }

  reqStatusLabel(status: string): string {
    const map: Record<string, string> = {
      'PENDING': 'Pending Review',
      'ACCOUNTS_APPROVED': 'Sent to MD',
      'MD_APPROVED': 'MD Approved',
      'ADVANCE_GIVEN': 'Advance Given',
      'SETTLED': 'Settled',
      'REJECTED': 'Rejected'
    };
    return map[status] || status;
  }

  async loadRequisitions() {
    const { data } = await this.supabase.getClient()
      .from('advance_requisitions')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) this.allRequisitions = data;
  }

  async approveRequisition(id: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update({ status: 'ACCOUNTS_APPROVED', approved_by: session?.user?.email, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Requisition approved.', 'success');
    await this.loadRequisitions();
  }

  openAdvanceGiveModal(id: string) {
    this.advanceGivingId = id;
    this.advancePayMode = 'Bank Transfer';
    this.advancePayRef = '';
    this.advancePayDate = new Date().toISOString().split('T')[0];
    this.advanceGiveModalOpen = true;
  }

  cancelAdvanceGive() {
    this.advanceGiveModalOpen = false;
    this.advanceGivingId = null;
  }

  async confirmAdvanceGiven() {
    if (!this.advanceGivingId) return;
    if (this.advancePayMode !== 'Cash' && !this.advancePayRef.trim()) {
      this.toast.show('Enter transaction reference', 'error'); return;
    }
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update({
        status: 'ADVANCE_GIVEN',
        payment_mode: this.advancePayMode,
        payment_ref: this.advancePayRef.trim() || null,
        payment_date: this.advancePayDate,
        advance_given_by: session?.user?.email
      })
      .eq('id', this.advanceGivingId);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Advance marked as given.', 'success');
    this.cancelAdvanceGive();
    await this.loadRequisitions();
  }

  async verifySettlement(id: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update({ status: 'SETTLED', settled_by: session?.user?.email, settled_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Settlement verified.', 'success');
    await this.loadRequisitions();
  }

  async rejectRequisition(id: string) {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update({ status: 'REJECTED', rejection_reason: reason })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Requisition rejected.', 'warning');
    await this.loadRequisitions();
  }

  // ── Fixed Recurring Expenses ──────────────────────────────────────────────
  async loadRecurring() {
    const { data } = await this.supabase.getClient()
      .from('recurring_expenses')
      .select('*')
      .order('month', { ascending: false });
    if (data) this.recurringExpenses = data;
  }

  async addRecurring() {
    if (!this.newRecurring.category || !this.newRecurring.amount || !this.newRecurring.month) {
      this.toast.show('Category, amount and month are required.', 'error'); return;
    }
    const monthDate = this.newRecurring.month + '-01';
    const { error } = await this.supabase.getClient()
      .from('recurring_expenses')
      .insert({
        category: this.newRecurring.category,
        amount: this.newRecurring.amount,
        month: monthDate,
        reference: this.newRecurring.reference || null,
        notes: this.newRecurring.notes || null,
        added_by: this.userEmail
      });
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Recurring expense added.', 'success');
    this.showAddRecurring = false;
    this.newRecurring = { category: 'EB', amount: 0, month: '', reference: '', notes: '' };
    await this.loadRecurring();
  }

  // ── Date Filtering ────────────────────────────────────────────────────────
  applyDateFilter() {
    // Filtering is handled inline via filteredForExport getter
    this.toast.show('Filter applied.', 'success');
  }

  get filteredForExport(): any[] {
    const statusMap: any = { pending: 'PENDING', verified: 'VERIFIED', approved: 'MD_APPROVED', paid: 'PAID', rejected: 'REJECTED' };
    let claims = this.allClaims;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      claims = claims.filter(c => c.title?.toLowerCase().includes(q) || c.claim_number?.toLowerCase().includes(q) || c.employee_email?.toLowerCase().includes(q));
    }
    if (this.selectedMonth !== 'all') claims = claims.filter(c => this.matchesMonth(c));
    if (this.activeSection !== 'all' && statusMap[this.activeSection]) claims = claims.filter(c => c.status === statusMap[this.activeSection]);
    if (this.filterFrom) claims = claims.filter(c => c.created_at >= this.filterFrom);
    if (this.filterTo) claims = claims.filter(c => c.created_at <= this.filterTo + 'T23:59:59');
    return claims;
  }

  // ── CSV Exports ───────────────────────────────────────────────────────────
  private toCsv(claims: any[]): string {
    const headers = ['claim_number','title','category','amount','submitted_by','status','created_at'];
    const rows = claims.map(c => headers.map(h => `"${(c[h] ?? '').toString().replace(/"/g, '""')}"`).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  private downloadCsv(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  exportMonthly() {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const claims = this.allClaims.filter(c => {
      const d = new Date(c.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
    });
    this.downloadCsv(this.toCsv(claims), `claims-${key}.csv`);
  }

  exportFinancialYear() {
    const now = new Date();
    const fyStart = now.getMonth() >= 3
      ? new Date(now.getFullYear(), 3, 1)
      : new Date(now.getFullYear() - 1, 3, 1);
    const fyEnd = new Date(fyStart.getFullYear() + 1, 2, 31);
    const claims = this.allClaims.filter(c => {
      const d = new Date(c.created_at);
      return d >= fyStart && d <= fyEnd;
    });
    this.downloadCsv(this.toCsv(claims), `claims-fy${fyStart.getFullYear()}-${fyEnd.getFullYear()}.csv`);
  }

  exportDateRange() {
    this.downloadCsv(this.toCsv(this.filteredForExport), 'claims-export.csv');
  }

  exportDateRangeExcel() {
    const claims = this.filteredForExport;
    const headers = ['Voucher ID', 'Title', 'Category', 'Amount (Rs.)', 'Submitted By', 'Status', 'Date'];
    const rows = claims.map(c => [
      c.claim_number, c.title, c.category, c.amount, c.submitted_by || c.employee_email || '', c.status,
      new Date(c.created_at).toLocaleDateString('en-IN')
    ]);
    let html = `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    rows.forEach(r => { html += `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`; });
    html += '</table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `claims-export-${new Date().toISOString().slice(0,10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
    this.toast.show('Exported to Excel!');
  }

  printReport() {
    window.print();
  }
}
