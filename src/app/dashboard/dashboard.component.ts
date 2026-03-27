import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ClaimDetailComponent, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  claims: any[] = [];
  selectedClaim: any = null;
  selectedMonth = 'all';
  selectedStatus = 'all';

  // Search & filter
  searchQuery = '';
  filterCategory = 'all';
  filterDateFrom = '';
  filterDateTo = '';

  // Sort
  sortColumn = 'created_at';
  sortDir: 'asc' | 'desc' = 'desc';

  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private toast: ToastService
  ) {}

  readonly categories = [
    'Travel & Transport', 'Accommodation', 'Meals & Entertainment',
    'Office Supplies', 'Software / Subscriptions', 'Training & Conference',
    'Vendor Invoice', 'Other'
  ];

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

  get selectedMonthLabel() {
    return this.availableMonths.find(m => m.key === this.selectedMonth)?.label || '';
  }

  get filteredClaims() {
    let list = this.claims.filter(c => {
      // Month filter
      if (this.selectedMonth !== 'all') {
        const d = new Date(c.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (key !== this.selectedMonth) return false;
      }
      // Status filter
      if (this.selectedStatus !== 'all' && c.status !== this.selectedStatus) return false;
      // Search
      if (this.searchQuery && !c.title.toLowerCase().includes(this.searchQuery.toLowerCase()) &&
          !c.claim_number.toLowerCase().includes(this.searchQuery.toLowerCase())) return false;
      // Category filter
      if (this.filterCategory !== 'all' && c.category !== this.filterCategory) return false;
      // Date range
      if (this.filterDateFrom && new Date(c.created_at) < new Date(this.filterDateFrom)) return false;
      if (this.filterDateTo && new Date(c.created_at) > new Date(this.filterDateTo + 'T23:59:59')) return false;
      return true;
    });

    // Sort
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

  // Month comparison analytics
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
  get thisMonthLabel() {
    return new Date().toLocaleString('default', { month: 'long' });
  }
  get lastMonthLabel() {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toLocaleString('default', { month: 'long' });
  }

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

  get hasActiveFilters() {
    return this.searchQuery || this.filterCategory !== 'all' ||
           this.filterDateFrom || this.filterDateTo || this.selectedStatus !== 'all';
  }

  exportCSV() {
    const headers = ['Claim ID', 'Title', 'Category', 'Amount', 'Status', 'Date', 'Vendor', 'Payment Mode'];
    const rows = this.filteredClaims.map(c => [
      c.claim_number, `"${c.title}"`, c.category, c.amount, c.status,
      new Date(c.created_at).toLocaleDateString('en-IN'), `"${c.vendor || ''}"`, c.pay_mode || ''
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `claims-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    this.toast.show('Exported to CSV successfully!');
  }

  async ngOnInit() {
    const { data } = await this.supabase.getClaims();
    if (data) this.claims = data;
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
