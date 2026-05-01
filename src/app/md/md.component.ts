import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterModule, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';
import { ToastService } from '../shared/toast.service';
import { NotifBellComponent } from '../notif-bell/notif-bell.component';
import { MdSidebarComponent } from '../md-sidebar/md-sidebar.component';

@Component({
  selector: 'app-md',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterModule, DatePipe, ClaimDetailComponent, FormsModule, NotifBellComponent, MdSidebarComponent],
  templateUrl: './md.component.html',
  styleUrls: ['./md.component.scss']
})
export class MdComponent implements OnInit {
  allClaims: any[] = [];
  allPOs: any[] = [];
  allRequisitions: any[] = [];
  get pendingReqCount(): number { return this.allRequisitions.filter(r => r.status === 'ACCOUNTS_APPROVED').length; }
  sidebarOpen = false;

  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebar() { this.sidebarOpen = false; }
  selectedClaim: any = null;
  selectedMonth = 'all';
  activeSection: string = 'all';
  rejectModalOpen = false;
  rejectingClaimId: string | null = null;
  rejectionReason = '';
  poRejectModalOpen = false;
  rejectingPOId: string | null = null;
  poRejectionReason = '';
  rejectReqModalOpen = false;
  rejectingReqId: string | null = null;
  reqRejectionReason = '';
  actionLoading = false;
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;
  loading = true;
  searchQuery = '';
  filterFrom = '';
  filterTo = '';

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

  private matchesDateRange(c: any) {
    if (this.filterFrom && c.created_at < this.filterFrom) return false;
    if (this.filterTo && c.created_at > this.filterTo + 'T23:59:59') return false;
    return true;
  }

  get verifiedClaims() {
    return this.allClaims.filter(c => {
      if (c.status !== 'VERIFIED') return false;
      if (!this.matchesMonth(c)) return false;
      if (!this.matchesDateRange(c)) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return c.title?.toLowerCase().includes(q) || c.claim_number?.toLowerCase().includes(q) || c.employee_email?.toLowerCase().includes(q);
      }
      return true;
    });
  }

  get approvedClaims() {
    return this.allClaims.filter(c => {
      if (c.status !== 'MD_APPROVED') return false;
      if (!this.matchesMonth(c)) return false;
      if (!this.matchesDateRange(c)) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return c.title?.toLowerCase().includes(q) || c.claim_number?.toLowerCase().includes(q) || c.employee_email?.toLowerCase().includes(q);
      }
      return true;
    });
  }

  get rejectedClaims() {
    return this.allClaims.filter(c => {
      if (c.status !== 'REJECTED') return false;
      if (!this.matchesMonth(c)) return false;
      if (!this.matchesDateRange(c)) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        return c.title?.toLowerCase().includes(q) || c.claim_number?.toLowerCase().includes(q) || c.employee_email?.toLowerCase().includes(q);
      }
      return true;
    });
  }

  get processedClaims() {
    return this.allClaims.filter(c =>
      (c.status === 'MD_APPROVED' || c.status === 'PAID' || c.status === 'REJECTED') &&
      this.matchesMonth(c) && this.matchesDateRange(c)
    );
  }

  get pendingValue() {
    return this.verifiedClaims.reduce((sum, c) => sum + c.amount, 0);
  }

  get totalPaid() {
    return this.allClaims
      .filter(c => {
        if (c.status !== 'PAID') return false;
        const d = new Date(c.payment_date || c.created_at);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === this.currentMonthKey;
      })
      .reduce((sum, c) => sum + c.amount, 0);
  }

  readonly PAGE_SIZE = 20;
  verifiedPage = 1;
  approvedPage = 1;
  rejectedPage = 1;

  get verifiedPaged() { return this.verifiedClaims.slice((this.verifiedPage - 1) * this.PAGE_SIZE, this.verifiedPage * this.PAGE_SIZE); }
  get verifiedTotalPages() { return Math.max(1, Math.ceil(this.verifiedClaims.length / this.PAGE_SIZE)); }
  get approvedPaged() { return this.processedClaims.slice((this.approvedPage - 1) * this.PAGE_SIZE, this.approvedPage * this.PAGE_SIZE); }
  get approvedTotalPages() { return Math.max(1, Math.ceil(this.processedClaims.length / this.PAGE_SIZE)); }
  get rejectedPaged() { return this.rejectedClaims.slice((this.rejectedPage - 1) * this.PAGE_SIZE, this.rejectedPage * this.PAGE_SIZE); }
  get rejectedTotalPages() { return Math.max(1, Math.ceil(this.rejectedClaims.length / this.PAGE_SIZE)); }

  get pendingPOs() {
    return this.allPOs.filter(p => p.status === 'acc_verified');
  }

  get approvedPOs() {
    return this.allPOs.filter(p => p.status === 'md_approved');
  }

  get pendingRequisitions() {
    return this.allRequisitions.filter(r => r.status === 'ACCOUNTS_APPROVED');
  }

  async approveRequisition(id: string) {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update({ status: 'MD_APPROVED', approved_by: session?.user?.email, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Advance requisition approved!', 'success');
    await this.ngOnInit();
  }

  openRejectReqModal(id: string) {
    this.rejectingReqId = id;
    this.reqRejectionReason = '';
    this.rejectReqModalOpen = true;
  }

  cancelRejectReq() {
    this.rejectReqModalOpen = false;
    this.rejectingReqId = null;
    this.reqRejectionReason = '';
  }

  async confirmRejectReq() {
    if (!this.rejectingReqId || !this.reqRejectionReason.trim()) return;
    const { error } = await this.supabase.getClient()
      .from('advance_requisitions')
      .update({ status: 'REJECTED', rejection_reason: this.reqRejectionReason.trim() })
      .eq('id', this.rejectingReqId);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Requisition rejected.', 'warning');
    this.cancelRejectReq();
    await this.ngOnInit();
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
  get userInitial() { return this.userName.charAt(0).toUpperCase() || 'M'; }

  async ngOnInit() {
    this.loading = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    this.userEmail = session?.user?.email || '';
    this.fullName = session?.user?.user_metadata?.['full_name'] || '';
    const { data } = await this.supabase.getClaims();
    if (data) this.allClaims = data;
    const { data: poData } = await this.supabase.getPurchaseOrders();
    if (poData) this.allPOs = poData;
    const { data: reqData } = await this.supabase.getClient()
      .from('advance_requisitions').select('*').order('created_at', { ascending: false });
    if (reqData) this.allRequisitions = reqData;
    this.loading = false;
    const openRef = this.route.snapshot.queryParamMap.get('open');
    if (openRef) {
      const claim = this.allClaims.find(c => c.claim_number === openRef || c.id === openRef);
      if (claim) this.selectedClaim = claim;
    }
  }

  slaHours(claim: any): number {
    return Math.floor((Date.now() - new Date(claim.created_at).getTime()) / 36e5);
  }

  get currentMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  get thisMonthApproved() {
    return this.allClaims.filter(c => {
      if (!['MD_APPROVED', 'PAID'].includes(c.status)) return false;
      const d = new Date(c.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === this.currentMonthKey;
    });
  }

  get thisMonthApprovedTotal() {
    return this.thisMonthApproved.reduce((s, c) => s + c.amount, 0);
  }

  get monthlySpendChart(): { label: string; amount: number; barPct: number }[] {
    const map = new Map<string, number>();
    for (const c of this.allClaims.filter(c => ['MD_APPROVED', 'PAID'].includes(c.status))) {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      map.set(key, (map.get(key) || 0) + c.amount);
    }
    const sorted = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6);
    const max = Math.max(...sorted.map(([, v]) => v), 1);
    return sorted.map(([key, amount]) => {
      const [yr, mo] = key.split('-');
      const label = new Date(+yr, +mo - 1, 1).toLocaleString('default', { month: 'short', year: '2-digit' });
      return { label, amount, barPct: Math.round(amount / max * 100) };
    });
  }

  get topCategories(): { category: string; amount: number }[] {
    const map = new Map<string, number>();
    for (const c of this.allClaims.filter(c => ['MD_APPROVED', 'PAID'].includes(c.status))) {
      map.set(c.category, (map.get(c.category) || 0) + c.amount);
    }
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);
  }

  get totalPaidAllTime() {
    return this.allClaims.filter(c => c.status === 'PAID').reduce((s, c) => s + c.amount, 0);
  }

  async approvePO(id: string) {
    this.actionLoading = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const po = this.allPOs.find(p => p.id === id);
    const { error } = await this.supabase.getClient()
      .from('purchase_orders')
      .update({ status: 'md_approved', md_approved_by: session?.user?.email || '' })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); this.actionLoading = false; return; }
    await this.supabase.logAudit({ entity_type: 'purchase_order', entity_id: id, entity_ref: po?.po_number, action: 'md_approved', performed_by: session?.user?.email || '', old_values: { status: po?.status }, new_values: { status: 'md_approved' } });
    const accountsEmails = await this.supabase.getUsersByRole('accounts');
    if (accountsEmails.length) {
      await this.supabase.createNotifications(accountsEmails, { title: `PO approved by MD — ${po?.po_number}`, body: `${po?.vendor_name}`, entity_type: 'purchase_order', entity_id: id, entity_ref: po?.po_number });
    }
    this.toast.show('PO approved!', 'success');
    this.actionLoading = false;
    await this.ngOnInit();
  }

  async approveClaim(id: string) {
    this.actionLoading = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const claim = this.allClaims.find(c => c.id === id);
    const approvedByName = session?.user?.user_metadata?.['full_name'] || session?.user?.email || '';
    const { error } = await this.supabase.getClient()
      .from('claims')
      .update({ status: 'MD_APPROVED', approved_by: session?.user?.email || '', approved_by_name: approvedByName, approved_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); this.actionLoading = false; return; }
    await this.supabase.logAudit({ entity_type: 'claim', entity_id: id, entity_ref: claim?.claim_number, action: 'md_approved', performed_by: session?.user?.email || '', old_values: { status: 'VERIFIED' }, new_values: { status: 'MD_APPROVED' } });
    // Fix: use claim_number (entity_ref) not claim.id so it matches how notifications were created
    await this.supabase.markNotificationsReadForEntity(session?.user?.email || '', claim?.claim_number || id);
    // Notify accounts dynamically — no hardcoded emails
    const accountsEmails = await this.supabase.getUsersByRole('accounts');
    if (accountsEmails.length) {
      await this.supabase.createNotifications(accountsEmails, { title: `MD approved — release payment — ${claim?.claim_number}`, body: `${claim?.title} · ₹${Number(claim?.amount).toLocaleString('en-IN')}`, entity_type: 'claim', entity_id: claim?.id, entity_ref: claim?.claim_number });
    }
    this.toast.show('Claim approved!', 'success');
    if (claim) {
      const token = await this.supabase.getAuthToken();
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event: 'approved', claimNumber: claim.claim_number, claimTitle: claim.title, amount: claim.amount, submittedBy: claim.employee_email || claim.submitted_by })
      }).catch(() => {});
    }
    this.actionLoading = false;
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
    await this.supabase.getClient()
      .from('purchase_orders')
      .update({ status: 'rejected', rejection_reason: this.poRejectionReason.trim() })
      .eq('id', this.rejectingPOId);
    this.toast.show('PO rejected.', 'warning');
    this.cancelPOReject();
    await this.ngOnInit();
  }

  async rejectClaim(id: string, reason: string) {
    this.actionLoading = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const claim = this.allClaims.find(c => c.id === id);
    const { error } = await this.supabase.getClient()
      .from('claims')
      .update({ status: 'REJECTED', rejection_reason: reason })
      .eq('id', id);
    if (error) { this.toast.show(error.message, 'error'); this.actionLoading = false; return; }
    await this.supabase.logAudit({ entity_type: 'claim', entity_id: id, entity_ref: claim?.claim_number, action: 'rejected', performed_by: session?.user?.email || '', old_values: { status: claim?.status }, new_values: { status: 'REJECTED', rejection_reason: reason } });
    this.toast.show('Claim rejected.', 'warning');
    if (claim?.employee_email) {
      const token = await this.supabase.getAuthToken();
      fetch('/api/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ event: 'rejected', claimNumber: claim.claim_number, claimTitle: claim.title, amount: claim.amount, employeeEmail: claim.employee_email })
      }).catch(() => {});
    }
    this.actionLoading = false;
    await this.ngOnInit();
  }

  openDetail(claim: any) {
    this.selectedClaim = claim;
  }

  closeDetail() {
    this.selectedClaim = null;
  }

  async openViewer(claim: any) {
    if (!claim.file_url) return;
    let fileUrl = claim.file_url;
    let fileName = claim.file_name;
    // file_url may be stored as a JSON array — use the first entry
    try {
      const parsed = JSON.parse(fileUrl);
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return; // empty array — no file
        fileUrl = parsed[0];
        const names = JSON.parse(fileName);
        fileName = Array.isArray(names) ? names[0] : fileName;
      }
    } catch {}
    const url = this.supabase.getFileUrl(fileUrl);
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    this.viewerIsPdf = ext === 'pdf';
    this.viewerName = fileName || 'Attachment';
    this.viewerUrl = this.viewerIsPdf
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : url;
    this.viewerOpen = true;
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerUrl = '';
  }

  get filteredForExport(): any[] {
    const statusMap: any = { pending: 'VERIFIED', approved: 'MD_APPROVED', rejected: 'REJECTED' };
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

  exportCSV() {
    const claims = this.filteredForExport;
    const headers = ['Voucher ID', 'Title', 'Category', 'Amount', 'Submitted By', 'Status', 'Date'];
    const rows = claims.map(c => [
      c.claim_number, `"${(c.title || '').replace(/"/g, '""')}"`, c.category, c.amount,
      c.submitted_by || c.employee_email || '', c.status,
      new Date(c.created_at).toLocaleDateString('en-IN')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `approvals-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    this.toast.show('Exported to CSV!');
  }

  exportExcel() {
    const claims = this.filteredForExport;
    const headers = ['Voucher ID', 'Title', 'Category', 'Amount (Rs.)', 'Submitted By', 'Status', 'Date'];
    const rows = claims.map(c => [
      c.claim_number, c.title, c.category, c.amount,
      c.submitted_by || c.employee_email || '', c.status,
      new Date(c.created_at).toLocaleDateString('en-IN')
    ]);
    let html = `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    rows.forEach(r => { html += `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`; });
    html += '</table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `approvals-${new Date().toISOString().slice(0,10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
    this.toast.show('Exported to Excel!');
  }

  exportPDF() {
    window.print();
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
