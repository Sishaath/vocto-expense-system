import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ClaimDetailComponent } from '../claim-detail/claim-detail.component';

@Component({
  selector: 'app-accounts',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, ClaimDetailComponent],
  templateUrl: './accounts.component.html',
  styleUrls: ['./accounts.component.scss']
})
export class AccountsComponent implements OnInit {
  allClaims: any[] = [];
  selectedClaim: any = null;
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

  get pendingClaims() {
    return this.allClaims.filter(c => c.status === 'PENDING');
  }
  get verifiedClaims() {
    return this.allClaims.filter(c => c.status === 'VERIFIED');
  }
  get approvedClaims() {
    return this.allClaims.filter(c => c.status === 'MD_APPROVED');
  }
  get paidClaims() {
    return this.allClaims.filter(c => c.status === 'PAID');
  }
  get totalPaid() {
    return this.paidClaims.reduce((sum, c) => sum + c.amount, 0);
  }

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.getClaims();
    if (data) this.allClaims = data;
  }

  async verifyClaim(id: string) {
    const user = await this.supabase.getClient().auth.getUser();
    await this.supabase.getClient()
      .from('claims')
      .update({
        status: 'VERIFIED',
        verified_by: user.data.user?.id,
        verified_at: new Date()
      })
      .eq('id', id);
    await this.ngOnInit();
  }

  async releasePay(id: string) {
    const user = await this.supabase.getClient().auth.getUser();
    await this.supabase.getClient()
      .from('claims')
      .update({
        status: 'PAID',
        paid_by: user.data.user?.id,
        paid_at: new Date()
      })
      .eq('id', id);
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
    const url = await this.supabase.getSignedFileUrl(claim.file_url);
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