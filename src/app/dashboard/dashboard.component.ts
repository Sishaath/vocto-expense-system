import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { environment } from '../../environments/environment';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';
import { ToastService } from '../shared/toast.service';
import { NotifBellComponent } from '../notif-bell/notif-bell.component';
import { SharedSidebarComponent } from '../shared-sidebar/shared-sidebar.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ClaimDetailComponent, FormsModule, NotifBellComponent, SharedSidebarComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  activeView: 'claims' | 'pos' = 'claims';
  userEmail = '';
  fullName = '';
  dueTemplates: any[] = [];
  budgetRows: { category: string; budget: number; actual: number; pct: number }[] = [];
  showBudgetPanel = false;
  sidebarOpen = false;

  toggleSidebar() { this.sidebarOpen = !this.sidebarOpen; }
  closeSidebar() { this.sidebarOpen = false; }

  // Claims
  claims: any[] = [];
  selectedClaim: any = null;
  selectedMonth = 'all';
  selectedStatus = 'all';
  searchQuery = '';
  filterCategory = 'all';
  filterDateFrom = '';
  filterDateTo = '';
  sortColumn = 'created_at';
  sortDir: 'asc' | 'desc' = 'desc';

  // POs
  pos: any[] = [];
  poSearch = '';
  poDateFrom = '';
  poDateTo = '';
  poStatus = 'all';
  poSortCol = 'created_at';
  poSortDir: 'asc' | 'desc' = 'desc';

  // File viewer
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private toast: ToastService
  ) {}

  readonly categories = [
    'Travel & Transport', 'Accommodation', 'Meals & Entertainment',
    'Office Supplies', 'Software / Subscriptions', 'Training & Conference',
    'Vendor Invoice', 'Other'
  ];

  // ─── Claims getters ───────────────────────────────────────────────────────

  get pendingCount() { return this.claims.filter(c => c.status === 'PENDING' || c.status === 'VERIFIED').length; }
  get approvedCount() { return this.claims.filter(c => c.status === 'MD_APPROVED').length; }
  get totalPaid() { return this.claims.filter(c => c.status === 'PAID').reduce((s, c) => s + c.amount, 0); }

  get availableMonths(): { key: string; label: string }[] {
    const seen = new Set<string>();
    const months: { key: string; label: string }[] = [];
    for (const c of this.claims) {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) {
        seen.add(key);
        months.push({ key, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });
      }
    }
    return months;
  }

  get filteredClaims() {
    let list = this.claims.filter(c => {
      if (this.selectedMonth !== 'all') {
        const d = new Date(c.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key !== this.selectedMonth) return false;
      }
      if (this.selectedStatus !== 'all' && c.status !== this.selectedStatus) return false;
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        if (!c.title?.toLowerCase().includes(q) && !c.claim_number?.toLowerCase().includes(q)) return false;
      }
      if (this.filterCategory !== 'all' && c.category !== this.filterCategory) return false;
      if (this.filterDateFrom && new Date(c.created_at) < new Date(this.filterDateFrom)) return false;
      if (this.filterDateTo && new Date(c.created_at) > new Date(this.filterDateTo + 'T23:59:59')) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let valA: any, valB: any;
      if (this.sortColumn === 'amount') { valA = a.amount; valB = b.amount; }
      else if (this.sortColumn === 'status') { valA = a.status; valB = b.status; }
      else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
      if (valA < valB) return this.sortDir === 'asc' ? -1 : 1;
      if (valA > valB) return this.sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  get monthTotal() { return this.filteredClaims.reduce((s, c) => s + c.amount, 0); }

  get thisMonthClaims() {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.claims.filter(c => {
      const d = new Date(c.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
    });
  }

  get lastMonthClaims() {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const key = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, '0')}`;
    return this.claims.filter(c => {
      const d = new Date(c.created_at);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` === key;
    });
  }

  get thisMonthTotal() { return this.thisMonthClaims.reduce((s, c) => s + c.amount, 0); }
  get lastMonthTotal() { return this.lastMonthClaims.reduce((s, c) => s + c.amount, 0); }
  get monthChangePercent() {
    if (this.lastMonthTotal === 0) return this.thisMonthTotal > 0 ? 100 : 0;
    return Math.round(((this.thisMonthTotal - this.lastMonthTotal) / this.lastMonthTotal) * 100);
  }
  get thisMonthLabel() { return new Date().toLocaleString('default', { month: 'long' }); }
  get lastMonthLabel() {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toLocaleString('default', { month: 'long' });
  }

  get hasActiveClaimFilters() {
    return this.searchQuery || this.filterCategory !== 'all' ||
           this.filterDateFrom || this.filterDateTo || this.selectedStatus !== 'all' || this.selectedMonth !== 'all';
  }

  // ─── PO getters ───────────────────────────────────────────────────────────

  get filteredPOs() {
    let list = this.pos.filter(p => {
      if (this.poSearch) {
        const q = this.poSearch.toLowerCase();
        if (!p.po_number?.toLowerCase().includes(q) &&
            !p.vendor_name?.toLowerCase().includes(q) &&
            !p.vendor_gstin?.toLowerCase().includes(q)) return false;
      }
      if (this.poStatus !== 'all' && p.status !== this.poStatus) return false;
      if (this.poDateFrom && new Date(p.date) < new Date(this.poDateFrom)) return false;
      if (this.poDateTo && new Date(p.date) > new Date(this.poDateTo)) return false;
      return true;
    });

    list = [...list].sort((a, b) => {
      let valA: any, valB: any;
      if (this.poSortCol === 'total') { valA = a.total; valB = b.total; }
      else if (this.poSortCol === 'status') { valA = a.status; valB = b.status; }
      else { valA = new Date(a.created_at).getTime(); valB = new Date(b.created_at).getTime(); }
      if (valA < valB) return this.poSortDir === 'asc' ? -1 : 1;
      if (valA > valB) return this.poSortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }

  get poTotal() { return this.filteredPOs.reduce((s, p) => s + (p.total || 0), 0); }
  get hasActivePOFilters() { return this.poSearch || this.poStatus !== 'all' || this.poDateFrom || this.poDateTo; }

  poSortBy(col: string) {
    if (this.poSortCol === col) { this.poSortDir = this.poSortDir === 'asc' ? 'desc' : 'asc'; }
    else { this.poSortCol = col; this.poSortDir = 'desc'; }
  }

  poSortIcon(col: string) {
    if (this.poSortCol !== col) return '↕';
    return this.poSortDir === 'asc' ? '↑' : '↓';
  }

  clearPOFilters() { this.poSearch = ''; this.poStatus = 'all'; this.poDateFrom = ''; this.poDateTo = ''; }

  poStatusLabel(status: string) {
    const map: any = { draft: 'Draft', pending: 'Pending', acc_verified: 'Verified', md_approved: 'Approved', rejected: 'Rejected' };
    return map[status] || status;
  }

  // ─── Sort / filter helpers (claims) ──────────────────────────────────────

  sortBy(col: string) {
    if (this.sortColumn === col) { this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'; }
    else { this.sortColumn = col; this.sortDir = 'desc'; }
  }

  sortIcon(col: string): string {
    if (this.sortColumn !== col) return '↕';
    return this.sortDir === 'asc' ? '↑' : '↓';
  }

  clearFilters() {
    this.searchQuery = ''; this.filterCategory = 'all';
    this.filterDateFrom = ''; this.filterDateTo = '';
    this.selectedStatus = 'all'; this.selectedMonth = 'all';
  }

  exportCSV() {
    const headers = ['Voucher ID', 'Title', 'Category', 'Amount', 'Status', 'Date'];
    const rows = this.filteredClaims.map(c => [
      c.claim_number, `"${c.title}"`, c.category, c.amount, c.status,
      new Date(c.created_at).toLocaleDateString('en-IN')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vouchers-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    this.toast.show('Exported to CSV!');
  }

  exportExcel() {
    const headers = ['Voucher ID', 'Title', 'Category', 'Amount (Rs.)', 'Status', 'Date'];
    const rows = this.filteredClaims.map(c => [
      c.claim_number, c.title, c.category, c.amount, c.status,
      new Date(c.created_at).toLocaleDateString('en-IN')
    ]);
    let html = `<table><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
    rows.forEach(r => { html += `<tr>${r.map(v => `<td>${v}</td>`).join('')}</tr>`; });
    html += '</table>';
    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `vouchers-${new Date().toISOString().slice(0,10)}.xls`;
    a.click(); URL.revokeObjectURL(url);
    this.toast.show('Exported to Excel!');
  }

  exportPDF() {
    window.print();
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  async ngOnInit() {
    // Read query params to support sidebar navigation
    this.route.queryParams.subscribe(params => {
      if (params['view']) this.activeView = params['view'] as 'claims' | 'pos';
      if (params['status']) this.selectedStatus = params['status'];
    });

    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    this.userEmail = session?.user?.email || '';
    this.fullName = session?.user?.user_metadata?.['full_name'] || '';
    // Role-based redirect — admin must not see employee dashboard
    const role = await this.supabase.getUserRole(this.userEmail);
    if (role === 'admin') { this.router.navigate(['/admin']); return; }
    if (role === 'accounts') { this.router.navigate(['/accounts']); return; }
    if (role === 'md') { this.router.navigate(['/md']); return; }
    const { data } = await this.supabase.getMyClaims(this.userEmail);
    if (data) this.claims = data;

    const { data: poData } = await this.supabase.getMyPurchaseOrders(this.userEmail);
    if (poData) this.pos = poData;

    // Load recurring templates due today or overdue
    const { data: templates } = await this.supabase.getMyTemplates(this.userEmail);
    if (templates) {
      const today = new Date().toISOString().split('T')[0];
      this.dueTemplates = templates.filter((t: any) => t.active && t.next_due_date <= today);
    }

    // Load budget summary for current month
    const now = new Date();
    const { data: budgets } = await this.supabase.getBudgets(now.getFullYear(), now.getMonth() + 1);
    if (budgets?.length) {
      const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthClaims = this.claims.filter(c =>
        ['MD_APPROVED', 'PAID'].includes(c.status) &&
        c.created_at >= startDate && c.created_at <= endDate + 'T23:59:59'
      );
      this.budgetRows = budgets.map((b: any) => {
        const actual = monthClaims.filter(c => c.category === b.category).reduce((s: number, c: any) => s + c.amount, 0);
        const pct = b.budget_amount > 0 ? Math.min(100, Math.round(actual / b.budget_amount * 100)) : 0;
        return { category: b.category, budget: b.budget_amount, actual, pct };
      }).filter((r: any) => r.budget > 0);
    }
  }

  submitFromTemplate(t: any) {
    this.router.navigate(['/submit'], { state: { templateData: t } });
  }
  freqLabel(f: string) { return { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[f] || f; }

  isExpiringSoon(claim: any): boolean {
    if (claim.status !== 'PENDING') return false;
    const days = (Date.now() - new Date(claim.created_at).getTime()) / 86400000;
    return days > 3;
  }

  openDetail(claim: any) { this.selectedClaim = claim; }
  closeDetail() { this.selectedClaim = null; }
  editClaim(claim: any) { this.router.navigate(['/edit', claim.id]); }

  async openViewer(claim: any) {
    if (!claim.file_url) return;
    const url = this.supabase.getFileUrl(claim.file_url);
    const ext = claim.file_name?.split('.').pop()?.toLowerCase() || '';
    this.viewerIsPdf = ext === 'pdf';
    this.viewerName = claim.file_name || 'Attachment';
    this.viewerUrl = this.viewerIsPdf ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : url;
    this.viewerOpen = true;
  }

  closeViewer() { this.viewerOpen = false; this.viewerUrl = ''; }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
