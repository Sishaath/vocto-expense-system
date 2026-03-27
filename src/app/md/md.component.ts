import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-md',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ClaimDetailComponent, FormsModule],
  templateUrl: './md.component.html',
  styleUrls: ['./md.component.scss']
})
export class MdComponent implements OnInit {
  allClaims: any[] = [];
  selectedClaim: any = null;
  selectedMonth = 'all';
  showRejected = false;
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

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

  get verifiedClaims() {
    return this.allClaims.filter(c => c.status === 'VERIFIED' && this.matchesMonth(c));
  }

  get approvedClaims() {
    return this.allClaims.filter(c => c.status === 'MD_APPROVED' && this.matchesMonth(c));
  }

  get rejectedClaims() {
    return this.allClaims.filter(c => c.status === 'REJECTED' && this.matchesMonth(c));
  }

  get processedClaims() {
    return this.allClaims.filter(c =>
      (c.status === 'MD_APPROVED' || c.status === 'PAID' || c.status === 'REJECTED') && this.matchesMonth(c)
    );
  }

  get pendingValue() {
    return this.verifiedClaims.reduce((sum, c) => sum + c.amount, 0);
  }

  get totalPaid() {
    return this.allClaims
      .filter(c => c.status === 'PAID')
      .reduce((sum, c) => sum + c.amount, 0);
  }

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private sanitizer: DomSanitizer,
    private toast: ToastService
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.getClaims();
    if (data) this.allClaims = data;
  }

  async approveClaim(id: string) {
    const user = await this.supabase.getClient().auth.getUser();
    await this.supabase.getClient()
      .from('claims')
      .update({
        status: 'MD_APPROVED',
        approved_by: user.data.user?.id,
        approved_at: new Date()
      })
      .eq('id', id);
    this.toast.show('Claim approved!');
    await this.ngOnInit();
  }

  async rejectClaim(id: string) {
    await this.supabase.getClient()
      .from('claims')
      .update({ status: 'REJECTED' })
      .eq('id', id);
    this.toast.show('Claim rejected.', 'warning');
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
