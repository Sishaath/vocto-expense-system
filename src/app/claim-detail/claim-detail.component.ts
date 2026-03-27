import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';

@Component({
  selector: 'app-claim-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './claim-detail.component.html',
  styleUrls: ['./claim-detail.component.scss']
})
export class ClaimDetailComponent implements OnChanges {
  @Input() claim: any = null;
  @Output() closed = new EventEmitter<void>();

  comments: any[] = [];
  newComment = '';
  sending = false;
  fileViewerOpen = false;
  fileViewerUrl: SafeResourceUrl | string = '';
  fileViewerIsPdf = false;

  constructor(
    private supabase: SupabaseService,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['claim'] && this.claim) {
      this.comments = [];
      this.newComment = '';
      this.fileViewerOpen = false;
      await this.loadComments();
    }
  }

  async loadComments() {
    const { data } = await this.supabase.getComments(this.claim.id);
    if (data) this.comments = data;
  }

  async sendComment() {
    if (!this.newComment.trim()) return;
    this.sending = true;
    const user = await this.supabase.getClient().auth.getUser();
    await this.supabase.addComment(
      this.claim.id,
      user.data.user?.id || '',
      this.newComment.trim()
    );
    this.newComment = '';
    await this.loadComments();
    this.sending = false;
  }

  async openFile() {
    if (!this.claim.file_url) return;
    const url = this.supabase.getFileUrl(this.claim.file_url);
    const ext = this.claim.file_name?.split('.').pop()?.toLowerCase() || '';
    this.fileViewerIsPdf = ext === 'pdf';
    this.fileViewerUrl = this.fileViewerIsPdf
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : url;
    this.fileViewerOpen = true;
  }

  closeFileViewer() {
    this.fileViewerOpen = false;
    this.fileViewerUrl = '';
  }

  close() {
    this.closed.emit();
  }

  avatarInitials(userId: string): string {
    return (userId || '??').slice(0, 2).toUpperCase();
  }

  get timelineSteps() {
    const s = this.claim?.status || '';
    const verified = ['VERIFIED', 'MD_APPROVED', 'PAID', 'REJECTED'].includes(s);
    const mdDone = ['MD_APPROVED', 'PAID'].includes(s);
    const rejected = s === 'REJECTED';
    return [
      {
        label: 'Submitted',
        sub: 'By Employee',
        date: this.claim?.created_at,
        done: true,
        current: false,
        rejected: false
      },
      {
        label: 'Accounts Verification',
        sub: verified ? 'By Accounts Team' : 'Awaiting Accounts',
        date: this.claim?.verified_at,
        done: verified,
        current: s === 'PENDING',
        rejected: false
      },
      {
        label: 'MD Approval',
        sub: mdDone ? 'By Managing Director' : rejected ? 'Rejected by MD' : 'Awaiting MD',
        date: this.claim?.approved_at,
        done: mdDone,
        current: s === 'VERIFIED',
        rejected: rejected
      },
      {
        label: 'Payment Released',
        sub: s === 'PAID' ? 'By Accounts Team' : 'Pending',
        date: this.claim?.paid_at,
        done: s === 'PAID',
        current: s === 'MD_APPROVED',
        rejected: false
      }
    ];
  }
}
