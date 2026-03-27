import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ClaimDetailComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  claims: any[] = [];
  selectedClaim: any = null;
  selectedMonth = 'all';
  selectedStatus = 'all';
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  get pendingCount() {
    return this.claims.filter(c => c.status === 'PENDING' || c.status === 'VERIFIED').length;
  }

  get approvedCount() {
    return this.claims.filter(c => c.status === 'MD_APPROVED').length;
  }

  get totalPaid() {
    return this.claims
      .filter(c => c.status === 'PAID')
      .reduce((sum, c) => sum + c.amount, 0);
  }

  get availableMonths(): { key: string; label: string }[] {
    const seen = new Set<string>();
    const months: { key: string; label: string }[] = [];
    for (const c of this.claims) {
      const d = new Date(c.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!seen.has(key)) {
        seen.add(key);
        months.push({
          key,
          label: d.toLocaleString('default', { month: 'long', year: 'numeric' })
        });
      }
    }
    return months;
  }

  get filteredClaims() {
    return this.claims.filter(c => {
      const monthMatch = this.selectedMonth === 'all' || (() => {
        const d = new Date(c.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        return key === this.selectedMonth;
      })();
      const statusMatch = this.selectedStatus === 'all' || c.status === this.selectedStatus;
      return monthMatch && statusMatch;
    });
  }

  get monthTotal() {
    return this.filteredClaims.reduce((sum, c) => sum + c.amount, 0);
  }

  get selectedMonthLabel() {
    return this.availableMonths.find(m => m.key === this.selectedMonth)?.label || '';
  }

  async ngOnInit() {
    const { data } = await this.supabase.getClaims();
    if (data) this.claims = data;
  }

  openDetail(claim: any) { this.selectedClaim = claim; }
  closeDetail() { this.selectedClaim = null; }

  editClaim(claim: any) {
    this.router.navigate(['/edit', claim.id]);
  }

  async openViewer(claim: any) {
    if (!claim.file_url) return;
    const url = this.supabase.getFileUrl(claim.file_url);
    const ext = claim.file_name?.split('.').pop()?.toLowerCase() || '';
    this.viewerIsPdf = ext === 'pdf';
    this.viewerName = claim.file_name || 'Attachment';
    this.viewerUrl = this.viewerIsPdf
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : url;
    this.viewerOpen = true;
  }

  closeViewer() {
    this.viewerOpen = false;
    this.viewerUrl = '';
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
