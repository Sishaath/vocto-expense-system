import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

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

  activeTab: 'details' | 'activity' = 'details';
  comments: any[] = [];
  auditLogs: any[] = [];
  newComment = '';
  sending = false;
  fileViewerOpen = false;
  fileViewerUrl: SafeResourceUrl | string = '';
  fileViewerIsPdf = false;
  fileViewerName = '';

  get fileList(): { path: string; name: string }[] {
    if (!this.claim?.file_url) return [];
    try {
      const paths = JSON.parse(this.claim.file_url);
      const names = JSON.parse(this.claim.file_name || '[]');
      if (Array.isArray(paths)) {
        return paths.map((p: string, i: number) => ({ path: p, name: names[i] || p.split('/').pop() || p }));
      }
    } catch {}
    return [{ path: this.claim.file_url, name: this.claim.file_name || 'Attachment' }];
  }

  constructor(
    private supabase: SupabaseService,
    private sanitizer: DomSanitizer,
    private toast: ToastService
  ) {}

  async ngOnChanges(changes: SimpleChanges) {
    if (changes['claim'] && this.claim) {
      this.comments = [];
      this.auditLogs = [];
      this.newComment = '';
      this.fileViewerOpen = false;
      this.activeTab = 'details';
      await Promise.all([this.loadComments(), this.loadAuditLogs()]);
    }
  }

  async loadComments() {
    const { data } = await this.supabase.getComments(this.claim.id);
    if (data) this.comments = data;
  }

  async loadAuditLogs() {
    const { data } = await this.supabase.getAuditLogs('claim', this.claim.id);
    // Also try claim_number as entity_id for logs written before we had uuid
    const { data: data2 } = await this.supabase.getAuditLogs('claim', this.claim.claim_number);
    const combined = [...(data || []), ...(data2 || [])];
    combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    this.auditLogs = combined;
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      PENDING: 'Waiting for Review',
      VERIFIED: 'Accounts Verified',
      MD_APPROVED: 'Approved',
      PAID: 'Paid',
      REJECTED: 'Rejected',
      WITHDRAWN: 'Withdrawn'
    };
    return map[status] || status;
  }

  auditLabel(action: string): string {
    const map: any = { submitted: 'Submitted', verified: 'Verified by Accounts', md_approved: 'Approved by MD', rejected: 'Rejected', paid: 'Payment Released', edited: 'Edited' };
    return map[action] || action;
  }

  auditIcon(action: string): string {
    const map: any = { submitted: '📤', verified: '✅', md_approved: '✅', rejected: '❌', paid: '💰', edited: '✏️' };
    return map[action] || '•';
  }

  async sendComment() {
    if (!this.newComment.trim()) return;
    this.sending = true;
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    const userLabel = session?.user?.email || session?.user?.id || 'Unknown';
    const { error } = await this.supabase.getClient().from('comments').insert({
      claim_id: this.claim.id,
      user_id: userLabel,
      message: this.newComment.trim()
    });
    if (error) {
      this.toast.show(error.message, 'error');
      this.sending = false;
      return;
    }
    this.newComment = '';
    await this.loadComments();
    this.sending = false;
  }

  openFile(path?: string, name?: string) {
    const filePath = path || this.claim.file_url;
    const fileName = name || this.claim.file_name || 'Attachment';
    if (!filePath) return;
    const url = this.supabase.getFileUrl(filePath);
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    this.fileViewerIsPdf = ext === 'pdf';
    this.fileViewerName = fileName;
    this.fileViewerUrl = this.fileViewerIsPdf
      ? this.sanitizer.bypassSecurityTrustResourceUrl(url)
      : url;
    this.fileViewerOpen = true;
  }

  closeFileViewer() {
    this.fileViewerOpen = false;
    this.fileViewerUrl = '';
  }

  printClaim() {
    const c = this.claim;
    if (!c) return;
    const statusMap: any = { PENDING: 'Pending', VERIFIED: 'Verified', MD_APPROVED: 'MD Approved', PAID: 'Paid', REJECTED: 'Rejected' };
    const html = `
      <html><head><title>Voucher ${c.claim_number}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; }
        h2 { color: #0C1F3D; margin-bottom: 4px; }
        .sub { color: #888; font-size: 13px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        td { padding: 10px 0; border-bottom: 1px solid #eee; font-size: 14px; }
        td:first-child { color: #888; width: 180px; }
        td:last-child { font-weight: 600; }
        .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; background: #f0f4ff; color: #0C1F3D; }
        .amount { font-size: 22px; font-weight: 700; color: #F4721B; }
        .footer { margin-top: 32px; font-size: 11px; color: #bbb; }
      </style></head>
      <body>
        <h2>Vocto Technologies — Expense Voucher</h2>
        <div class="sub">Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <table>
          <tr><td>Voucher ID</td><td>${c.claim_number}</td></tr>
          <tr><td>Title</td><td>${c.title}</td></tr>
          <tr><td>Category</td><td>${c.category}</td></tr>
          <tr><td>Amount</td><td class="amount">₹${Number(c.amount).toLocaleString('en-IN')}</td></tr>
          <tr><td>Expense Date</td><td>${c.expense_date ? new Date(c.expense_date).toLocaleDateString('en-IN') : '—'}</td></tr>
          <tr><td>Vendor</td><td>${c.vendor || '—'}</td></tr>
          <tr><td>Payment Mode</td><td>${c.pay_mode || '—'}</td></tr>
          <tr><td>Submitted By</td><td>${c.employee_email || '—'}</td></tr>
          <tr><td>Submitted On</td><td>${new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</td></tr>
          <tr><td>Status</td><td><span class="badge">${statusMap[c.status] || c.status}</span></td></tr>
          ${c.description ? `<tr><td>Description</td><td>${c.description}</td></tr>` : ''}
          ${c.rejection_reason ? `<tr><td>Rejection Reason</td><td style="color:#c0392b">${c.rejection_reason}</td></tr>` : ''}
        </table>
        <div class="footer">Vocto Technologies · vocto-expense-system.vercel.app</div>
      </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }

  close() {
    this.closed.emit();
  }

  avatarInitials(userId: string): string {
    if (!userId) return '??';
    // If email, use first letters of name parts
    if (userId.includes('@')) return userId.split('@')[0].slice(0, 2).toUpperCase();
    return userId.slice(0, 2).toUpperCase();
  }

  nameFromEmail(email: string): string {
    if (!email) return '';
    return email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  get timelineSteps() {
    const s = this.claim?.status || '';
    const verified = ['VERIFIED', 'MD_APPROVED', 'PAID', 'REJECTED'].includes(s);
    const mdDone = ['MD_APPROVED', 'PAID'].includes(s);
    const rejected = s === 'REJECTED';
    const verifiedBy = this.claim?.verified_by_name || (this.claim?.verified_by ? this.nameFromEmail(this.claim.verified_by) : '');
    const approvedBy = this.claim?.approved_by_name || (this.claim?.approved_by ? this.nameFromEmail(this.claim.approved_by) : '');
    const paidBy = this.claim?.paid_by_name || (this.claim?.paid_by ? this.nameFromEmail(this.claim.paid_by) : '');
    const submittedBy = this.claim?.employee_email ? this.nameFromEmail(this.claim.employee_email) : 'Employee';
    return [
      {
        label: 'Submitted',
        sub: submittedBy,
        date: this.claim?.created_at,
        done: true,
        current: false,
        rejected: false
      },
      {
        label: 'Accounts Verification',
        sub: verified ? (verifiedBy || 'Accounts Team') : 'Awaiting Accounts',
        date: this.claim?.verified_at,
        done: verified,
        current: s === 'PENDING',
        rejected: false
      },
      {
        label: 'MD Approval',
        sub: mdDone ? (approvedBy || 'MD') : rejected ? 'Rejected' : 'Awaiting MD',
        date: this.claim?.approved_at,
        done: mdDone,
        current: s === 'VERIFIED',
        rejected: rejected
      },
      {
        label: 'Payment Released',
        sub: s === 'PAID' ? (paidBy || 'Accounts Team') : 'Pending',
        date: this.claim?.paid_at,
        done: s === 'PAID',
        current: s === 'MD_APPROVED',
        rejected: false
      }
    ];
  }
}
