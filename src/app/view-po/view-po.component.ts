import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SupabaseService, PurchaseOrder } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

const ACCOUNTS_EMAILS = ['yogeshwari@voctotechnologies.com', 'accounts@voctotechnologies.com'];
const MD_EMAILS = ['rrk@voctotechnologies.com', 'md@voctotechnologies.com'];

@Component({
  selector: 'app-view-po',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './view-po.component.html',
  styleUrl: './view-po.component.scss'
})
export class ViewPoComponent implements OnInit {
  po: PurchaseOrder | null = null;
  loading = true;
  userEmail = '';
  isAccounts = false;
  vendorId: string | null = null;
  vendorRating = 0;
  vendorNotes = '';
  existingRatingId: string | null = null;
  ratingSubmitting = false;
  isMD = false;

  // Vendor invoice upload
  invoiceUploading = false;
  invoiceNumber = '';
  invoiceDate = '';
  invoiceFile: File | null = null;
  invoiceFileName = '';
  invoiceViewerOpen = false;
  invoiceViewerUrl: SafeResourceUrl = '';

  constructor(
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    public router: Router,
    private toast: ToastService,
    private sanitizer: DomSanitizer
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.getClient().auth.getSession();
    if (!data.session) { this.router.navigate(['/login']); return; }
    this.userEmail = data.session.user?.email || '';
    this.isAccounts = ACCOUNTS_EMAILS.includes(this.userEmail);
    this.isMD = MD_EMAILS.includes(this.userEmail);
    const id = this.route.snapshot.paramMap.get('id')!;
    const { data: poData, error } = await this.supabase.getClient()
      .from('purchase_orders').select('*').eq('id', id).single();
    this.loading = false;
    if (error || !poData) { this.toast.show('PO not found', 'error'); this.router.navigate(['/dashboard']); return; }
    this.po = poData as PurchaseOrder;
    // Sync vendor to directory and load rating when PO is md_approved
    if (this.po.status === 'md_approved' && this.po.vendor_name) {
      await this.syncVendorAndRating();
    }
    // Insert price history rows if md_approved (idempotent check via po_id)
    if (this.po.status === 'md_approved' && this.vendorId && this.po.items?.length) {
      const { data: existing } = await this.supabase.getClient()
        .from('vendor_price_history').select('id').eq('po_id', this.po.id).limit(1);
      if (!existing?.length) {
        const rows = this.po.items.map(item => ({
          vendor_id: this.vendorId ?? undefined,
          po_id: this.po!.id,
          po_number: this.po!.po_number || '',
          po_date: this.po!.date,
          item_description: item.description,
          hsn_code: item.hsn_code || undefined,
          unit: item.unit,
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_rate: item.gst_rate,
          amount: item.amount,
          currency: this.po!.currency || 'INR',
          inr_unit_price: this.po!.currency !== 'INR' && this.po!.exchange_rate
            ? Math.round(item.unit_price * this.po!.exchange_rate * 100) / 100
            : item.unit_price
        }));
        await this.supabase.insertPriceHistory(rows);
      }
    }
    if (this.po.vendor_invoice_number) this.invoiceNumber = this.po.vendor_invoice_number;
    if (this.po.vendor_invoice_date) this.invoiceDate = this.po.vendor_invoice_date;
  }

  onInvoiceFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { this.toast.show('File exceeds 10MB limit', 'error'); return; }
    this.invoiceFile = file;
    this.invoiceFileName = file.name;
  }

  async uploadVendorInvoice() {
    if (!this.po?.id) return;
    if (!this.invoiceNumber.trim()) { this.toast.show('Enter invoice number', 'error'); return; }
    if (!this.invoiceDate) { this.toast.show('Enter invoice date', 'error'); return; }
    this.invoiceUploading = true;
    let invoiceUrl = this.po.vendor_invoice_url || '';
    let invoiceName = this.po.vendor_invoice_name || '';
    if (this.invoiceFile) {
      const ext = this.invoiceFile.name.split('.').pop();
      const path = `po-invoices/${this.po.id}/${Date.now()}.${ext}`;
      const { data: uploadData, error: uploadError } = await this.supabase.getClient()
        .storage.from('claim-documents').upload(path, this.invoiceFile, { upsert: true });
      if (uploadError) { this.toast.show('Upload failed: ' + uploadError.message, 'error'); this.invoiceUploading = false; return; }
      invoiceUrl = uploadData.path;
      invoiceName = this.invoiceFile.name;
    }
    const { error } = await this.supabase.getClient()
      .from('purchase_orders')
      .update({
        vendor_invoice_url: invoiceUrl,
        vendor_invoice_name: invoiceName,
        vendor_invoice_number: this.invoiceNumber.trim(),
        vendor_invoice_date: this.invoiceDate
      })
      .eq('id', this.po.id);
    this.invoiceUploading = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.po = { ...this.po, vendor_invoice_url: invoiceUrl, vendor_invoice_name: invoiceName, vendor_invoice_number: this.invoiceNumber.trim(), vendor_invoice_date: this.invoiceDate };
    this.invoiceFile = null;
    this.invoiceFileName = '';
    this.toast.show('Vendor invoice saved!', 'success');
  }

  openInvoiceViewer() {
    if (!this.po?.vendor_invoice_url) return;
    const url = this.supabase.getFileUrl(this.po.vendor_invoice_url);
    this.invoiceViewerUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
    this.invoiceViewerOpen = true;
  }

  get isInterState() {
    return this.po?.vendor_state_code && this.po.vendor_state_code !== '33';
  }

  vendorLinkCopied = false;

  print() { window.print(); }

  async copyVendorLink() {
    if (!this.po?.id) return;
    const link = `${window.location.origin}/po/view/${this.po.id}`;
    try {
      await navigator.clipboard.writeText(link);
      this.vendorLinkCopied = true;
      setTimeout(() => this.vendorLinkCopied = false, 2500);
      this.toast.show('Vendor link copied to clipboard!', 'success');
    } catch {
      this.toast.show('Could not copy — please copy the URL manually.', 'error');
    }
  }

  async markAccepted() {
    if (!this.po?.id) return;
    await this.supabase.getClient()
      .from('purchase_orders').update({ status: 'accepted' }).eq('id', this.po.id);
    this.po = { ...this.po, status: 'accepted' };
    this.toast.show('PO marked as Accepted', 'success');
  }

  async markSent() {
    if (!this.po?.id) return;
    await this.supabase.getClient()
      .from('purchase_orders').update({ status: 'sent' }).eq('id', this.po.id);
    this.po = { ...this.po, status: 'sent' };
    this.toast.show('PO marked as Sent', 'success');
  }

  statusLabel(s?: string) {
    return { draft: 'Draft', sent: 'Sent to Vendor', accepted: 'Accepted', cancelled: 'Cancelled', pending: 'Pending Review', acc_verified: 'Acc. Verified', md_approved: 'MD Approved' }[s || ''] || s;
  }

  addressLines(addr?: string): string[] {
    return (addr || '').split('\n').filter(Boolean);
  }

  async syncVendorAndRating() {
    if (!this.po) return;
    // Upsert vendor
    const { data: vendor } = await this.supabase.upsertVendor({
      name: this.po.vendor_name,
      gstin: this.po.vendor_gstin || undefined,
      pan: this.po.vendor_pan || undefined,
      email: this.po.vendor_email || undefined,
      phone: this.po.vendor_phone || undefined,
      city: this.po.vendor_city || undefined,
      state: this.po.vendor_state || undefined
    });
    if (vendor) {
      this.vendorId = vendor.id;
      // Load existing rating for this PO by this user
      const { data: existing } = await this.supabase.getRatingForPO(this.po.id!, this.userEmail);
      if (existing) {
        this.existingRatingId = existing.id;
        this.vendorRating = existing.rating;
        this.vendorNotes = existing.notes || '';
      }
    }
  }

  async submitRating() {
    if (!this.vendorId || !this.po?.id || this.vendorRating === 0) {
      this.toast.show('Select a star rating first', 'error'); return;
    }
    this.ratingSubmitting = true;
    const payload: any = {
      vendor_id: this.vendorId,
      po_id: this.po.id,
      po_number: this.po.po_number || '',
      rating: this.vendorRating,
      notes: this.vendorNotes,
      rated_by: this.userEmail
    };
    if (this.existingRatingId) payload.id = this.existingRatingId;
    const { error } = await this.supabase.upsertRating(payload);
    this.ratingSubmitting = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Rating saved!', 'success');
  }

  setRating(n: number) { this.vendorRating = n; }
  starClass(n: number) { return n <= this.vendorRating ? 'star filled' : 'star'; }
}
