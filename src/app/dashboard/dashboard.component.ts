import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  claims: any[] = [];
  viewerOpen = false;
  viewerUrl: SafeResourceUrl | string = '';
  viewerName = '';
  viewerIsPdf = false;

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

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    const { data, error } = await this.supabase.getClaims();
    if (data) this.claims = data;
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