import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-md',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './md.component.html',
  styleUrls: ['./md.component.scss']
})
export class MdComponent implements OnInit {
  allClaims: any[] = [];
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

  get verifiedClaims() {
    return this.allClaims.filter(c => c.status === 'VERIFIED');
  }

  get approvedClaims() {
    return this.allClaims.filter(c => c.status === 'MD_APPROVED');
  }

  get processedClaims() {
    return this.allClaims.filter(c =>
      c.status === 'MD_APPROVED' ||
      c.status === 'PAID' ||
      c.status === 'REJECTED'
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
    private sanitizer: DomSanitizer
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
    await this.ngOnInit();
  }

  async rejectClaim(id: string) {
    await this.supabase.getClient()
      .from('claims')
      .update({ status: 'REJECTED' })
      .eq('id', id);
    await this.ngOnInit();
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