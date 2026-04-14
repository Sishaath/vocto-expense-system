import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule, DatePipe } from '@angular/common';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';
import { SharedSidebarComponent } from '../shared-sidebar/shared-sidebar.component';

export interface InvoiceItem {
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  unit_price: number;
  gst_rate: number;
  amount: number;
}

@Component({
  selector: 'app-sales-invoice',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, DatePipe, SharedSidebarComponent],
  templateUrl: './sales-invoice.component.html',
  styleUrls: ['./sales-invoice.component.scss']
})
export class SalesInvoiceComponent implements OnInit {
  invoiceType: 'export' | 'dta' = 'export';
  isNew = true;
  invoiceId = '';
  invoice: any = null;

  // Form fields
  invoice_date = new Date().toISOString().split('T')[0];
  customer_name = '';
  customer_address = '';
  customer_gstin = '';
  customer_country = '';
  payment_terms = '';
  delivery_terms = '';
  notes = '';

  items: InvoiceItem[] = [this.blankItem()];

  loading = false;
  saving = false;
  errorMsg = '';
  userEmail = '';

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    this.userEmail = session?.user?.email || '';

    // Determine type from URL
    const url = this.router.url;
    this.invoiceType = url.includes('/dta/') ? 'dta' : 'export';

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'create') {
      this.isNew = false;
      this.invoiceId = id;
      await this.loadInvoice(id);
    }
  }

  blankItem(): InvoiceItem {
    return { description: '', hsn_code: '', quantity: 1, unit: 'Nos', unit_price: 0, gst_rate: this.invoiceType === 'export' ? 0 : 18, amount: 0 };
  }

  async loadInvoice(id: string) {
    this.loading = true;
    const { data, error } = await this.supabase.getClient()
      .from('sales_invoices').select('*').eq('id', id).single();
    this.loading = false;
    if (error || !data) { this.errorMsg = 'Could not load invoice.'; return; }
    this.invoice = data;
    this.invoice_date = data.invoice_date;
    this.customer_name = data.customer_name;
    this.customer_address = data.customer_address || '';
    this.customer_gstin = data.customer_gstin || '';
    this.customer_country = data.customer_country || '';
    this.payment_terms = data.payment_terms || '';
    this.delivery_terms = data.delivery_terms || '';
    this.notes = data.notes || '';
    this.items = data.items && data.items.length ? data.items : [this.blankItem()];
  }

  addItem() {
    this.items.push(this.blankItem());
  }

  removeItem(i: number) {
    if (this.items.length > 1) this.items.splice(i, 1);
    this.recalc();
  }

  calcItemAmount(item: InvoiceItem) {
    item.amount = item.quantity * item.unit_price;
    this.recalc();
  }

  recalc() {
    // amounts already set
  }

  get subtotal(): number {
    return this.items.reduce((s, i) => s + (i.amount || 0), 0);
  }

  get cgst(): number {
    if (this.invoiceType === 'export') return 0;
    return this.items.reduce((s, i) => s + (i.amount * i.gst_rate / 200), 0);
  }

  get sgst(): number {
    if (this.invoiceType === 'export') return 0;
    return this.items.reduce((s, i) => s + (i.amount * i.gst_rate / 200), 0);
  }

  get igst(): number { return 0; }

  get total(): number {
    return this.subtotal + this.cgst + this.sgst + this.igst;
  }

  get invoiceTypeLabel(): string {
    return this.invoiceType === 'export' ? 'Export Sales Invoice' : 'DTA Sales Invoice';
  }

  get typePrefix(): string {
    return this.invoiceType === 'export' ? 'export' : 'dta';
  }

  async saveDraft() {
    if (!this.customer_name || !this.invoice_date) {
      this.errorMsg = 'Customer name and invoice date are required.'; return;
    }
    this.saving = true; this.errorMsg = '';
    const payload = this.buildPayload('draft');
    const { error } = this.isNew
      ? await this.supabase.getClient().from('sales_invoices').insert(payload)
      : await this.supabase.getClient().from('sales_invoices').update(payload).eq('id', this.invoiceId);
    this.saving = false;
    if (error) { this.errorMsg = error.message; return; }
    this.toast.show('Invoice saved as draft.', 'success');
    setTimeout(() => this.router.navigate(['/dashboard']), 1200);
  }

  buildPayload(status: string) {
    return {
      invoice_type: this.invoiceType,
      invoice_date: this.invoice_date,
      customer_name: this.customer_name,
      customer_address: this.customer_address || null,
      customer_gstin: this.customer_gstin || null,
      customer_country: this.customer_country || null,
      items: this.items,
      subtotal: this.subtotal,
      cgst: this.cgst,
      sgst: this.sgst,
      igst: this.igst,
      total: this.total,
      payment_terms: this.payment_terms || null,
      delivery_terms: this.delivery_terms || null,
      notes: this.notes || null,
      status,
      created_by: this.userEmail,
      updated_at: new Date().toISOString()
    };
  }

  printInvoice() {
    window.print();
  }
}
