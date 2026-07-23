import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Customer, CatalogItem, InvoiceLineItem } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

const COMPANY_STATE_CODE = '33'; // Tamil Nadu — drives CGST/SGST vs IGST

type DocType = 'invoice' | 'estimate' | 'credit_note';

@Component({
  selector: 'app-invoice-editor',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './invoice-editor.component.html',
  styleUrls: ['./invoice-editor.component.scss']
})
export class InvoiceEditorComponent implements OnInit {
  docType: DocType = 'invoice';
  isNew = true;
  docId = '';
  doc: any = null;

  customers: Customer[] = [];
  catalog: CatalogItem[] = [];
  sourceInvoices: any[] = [];  // for credit notes

  customer_id: string | null = null;
  invoice_type: 'domestic' | 'export' | 'dta' = 'domestic';
  doc_date = new Date().toISOString().split('T')[0];
  due_date = '';
  valid_until = '';
  source_invoice_id: string | null = null;   // credit note origin
  reason = '';                                // credit note reason
  payment_terms = '';
  notes = '';

  lines: InvoiceLineItem[] = [this.blankLine()];

  loading = false;
  saving = false;
  errorMsg = '';
  userEmail = '';

  constructor(
    private supabase: SupabaseService,
    public router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  blankLine(): InvoiceLineItem {
    return { description: '', hsn_sac_code: '', quantity: 1, unit: 'Nos', unit_price: 0, discount_pct: 0, gst_rate: this.invoice_type === 'export' ? 0 : 18, item_id: null };
  }

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    this.userEmail = session?.user?.email || '';
    this.docType = (this.route.snapshot.data['docType'] as DocType) || 'invoice';

    const [cust, items] = await Promise.all([this.supabase.getCustomers(), this.supabase.getItems()]);
    this.customers = (cust.data || []).filter((c: any) => c.active !== false);
    this.catalog = (items.data || []).filter((i: any) => i.active !== false);

    if (this.docType === 'credit_note') {
      const inv = await this.supabase.getInvoices();
      this.sourceInvoices = (inv.data || []).filter((i: any) => !['draft', 'cancelled'].includes(i.status));
    }

    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'create') {
      this.isNew = false;
      this.docId = id;
      await this.loadDoc(id);
    } else {
      const st: any = history.state || {};
      if (st.customerId) { this.customer_id = st.customerId; this.onCustomerChange(); }
      if (st.invoiceId && this.docType === 'credit_note') { this.source_invoice_id = st.invoiceId; await this.onSourceInvoiceChange(); }
    }
  }

  get table(): string {
    return this.docType === 'invoice' ? 'sales_invoices' : this.docType === 'estimate' ? 'estimates' : 'credit_notes';
  }

  get docLabel(): string {
    return this.docType === 'invoice' ? 'Tax Invoice' : this.docType === 'estimate' ? 'Estimate / Quote' : 'Credit Note';
  }

  get docNumber(): string {
    if (!this.doc) return 'Draft';
    return this.doc.invoice_number || this.doc.estimate_number || this.doc.credit_note_number || 'Draft';
  }

  get isFinalized(): boolean {
    return !!this.doc && !['draft'].includes(this.doc.status);
  }

  get selectedCustomer(): any {
    return this.customers.find((c: any) => c.id === this.customer_id) || null;
  }

  get isInterstate(): boolean {
    const c = this.selectedCustomer;
    if (this.invoice_type === 'export') return false; // zero-rated
    const code = c?.state_code || '';
    return !!code && code !== COMPANY_STATE_CODE;
  }

  get taxFree(): boolean {
    return this.invoice_type === 'export' || this.selectedCustomer?.customer_type === 'sez';
  }

  async loadDoc(id: string) {
    this.loading = true;
    const { data, error } = await this.supabase.getClient().from(this.table).select('*').eq('id', id).single();
    this.loading = false;
    if (error || !data) { this.errorMsg = 'Could not load document.'; return; }
    this.doc = data;
    this.customer_id = data.customer_id || null;
    this.invoice_type = data.invoice_type || 'domestic';
    this.doc_date = data.invoice_date || data.estimate_date || data.credit_date || this.doc_date;
    this.due_date = data.due_date || '';
    this.valid_until = data.valid_until || '';
    this.source_invoice_id = data.invoice_id || null;
    this.reason = data.reason || '';
    this.payment_terms = data.payment_terms || '';
    this.notes = data.notes || '';
    if (this.docType === 'invoice') {
      const li = await this.supabase.getInvoiceLineItems(id);
      this.lines = (li.data && li.data.length) ? li.data : (data.items?.length ? data.items.map((x: any) => this.fromLegacyItem(x)) : [this.blankLine()]);
    } else {
      this.lines = data.items?.length ? data.items : [this.blankLine()];
    }
    this.lines.forEach(l => this.recalcLine(l));
  }

  fromLegacyItem(x: any): InvoiceLineItem {
    return { description: x.description, hsn_sac_code: x.hsn_code || x.hsn_sac_code || '', quantity: x.quantity || 1, unit: x.unit || 'Nos', unit_price: x.unit_price || 0, discount_pct: x.discount_pct || 0, gst_rate: x.gst_rate || 0, item_id: x.item_id || null };
  }

  onCustomerChange() {
    const c = this.selectedCustomer;
    if (!c) return;
    if (c.customer_type === 'export') this.invoice_type = 'export';
    if (c.payment_terms && !this.payment_terms) this.payment_terms = c.payment_terms;
    if (!this.due_date && this.docType === 'invoice') {
      const d = new Date(this.doc_date); d.setDate(d.getDate() + 30);
      this.due_date = d.toISOString().split('T')[0];
    }
    this.lines.forEach(l => this.recalcLine(l));
  }

  async onSourceInvoiceChange() {
    const inv = this.sourceInvoices.find((i: any) => i.id === this.source_invoice_id);
    if (!inv) return;
    this.customer_id = inv.customer_id || null;
    this.invoice_type = inv.invoice_type || 'domestic';
    const li = await this.supabase.getInvoiceLineItems(inv.id);
    const src = (li.data && li.data.length) ? li.data : (inv.items || []);
    this.lines = src.length ? src.map((x: any) => this.fromLegacyItem(x)) : [this.blankLine()];
    this.lines.forEach(l => this.recalcLine(l));
  }

  onItemPicked(line: InvoiceLineItem) {
    const item = this.catalog.find((i: any) => i.id === line.item_id);
    if (!item) return;
    line.description = item.name;
    line.hsn_sac_code = item.hsn_sac_code || '';
    line.unit = item.unit || 'Nos';
    line.unit_price = item.unit_price || 0;
    line.gst_rate = this.taxFree ? 0 : (item.gst_rate ?? 18);
    this.recalcLine(line);
  }

  addLine() { this.lines.push(this.blankLine()); }
  removeLine(i: number) { if (this.lines.length > 1) this.lines.splice(i, 1); }

  recalcLine(l: InvoiceLineItem) {
    const gross = (l.quantity || 0) * (l.unit_price || 0);
    const taxable = gross * (1 - (l.discount_pct || 0) / 100);
    l.taxable_value = Math.round(taxable * 100) / 100;
    const rate = this.taxFree ? 0 : (l.gst_rate || 0);
    if (this.isInterstate) {
      l.igst = Math.round(taxable * rate) / 100;
      l.cgst = 0; l.sgst = 0;
    } else {
      l.cgst = Math.round(taxable * rate / 2) / 100;
      l.sgst = Math.round(taxable * rate / 2) / 100;
      l.igst = 0;
    }
    l.line_total = Math.round((l.taxable_value + (l.cgst || 0) + (l.sgst || 0) + (l.igst || 0)) * 100) / 100;
  }

  recalcAll() { this.lines.forEach(l => this.recalcLine(l)); }

  get subtotal(): number { return this.lines.reduce((s, l) => s + (l.taxable_value || 0), 0); }
  get cgst(): number { return this.lines.reduce((s, l) => s + (l.cgst || 0), 0); }
  get sgst(): number { return this.lines.reduce((s, l) => s + (l.sgst || 0), 0); }
  get igst(): number { return this.lines.reduce((s, l) => s + (l.igst || 0), 0); }
  get total(): number { return Math.round((this.subtotal + this.cgst + this.sgst + this.igst) * 100) / 100; }

  // Distinct GST rates with totals — for the print tax summary table
  get taxSummary(): { rate: number; taxable: number; cgst: number; sgst: number; igst: number }[] {
    const map = new Map<number, any>();
    for (const l of this.lines) {
      const r = this.taxFree ? 0 : (l.gst_rate || 0);
      const e = map.get(r) || { rate: r, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
      e.taxable += l.taxable_value || 0; e.cgst += l.cgst || 0; e.sgst += l.sgst || 0; e.igst += l.igst || 0;
      map.set(r, e);
    }
    return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
  }

  amountInWords(n: number): string {
    if (!n || n <= 0) return '';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const two = (x: number): string => x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : '');
    const three = (x: number): string => x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x);
    const num = Math.floor(n);
    const paise = Math.round((n - num) * 100);
    let out = '';
    const crore = Math.floor(num / 10000000), lakh = Math.floor((num % 10000000) / 100000), thousand = Math.floor((num % 100000) / 1000), rest = num % 1000;
    if (crore) out += three(crore) + ' Crore ';
    if (lakh) out += two(lakh) + ' Lakh ';
    if (thousand) out += two(thousand) + ' Thousand ';
    if (rest) out += three(rest);
    out = 'Rupees ' + (out.trim() || 'Zero');
    if (paise) out += ' and ' + two(paise) + ' Paise';
    return out + ' Only';
  }

  private buildPayload(status: string): any {
    const c = this.selectedCustomer;
    const base: any = {
      customer_id: this.customer_id,
      customer_name: c?.name || this.doc?.customer_name || '',
      items: this.lines.map(({ id, invoice_id, ...rest }: any) => rest),
      subtotal: this.subtotal,
      cgst: this.cgst, sgst: this.sgst, igst: this.igst,
      total: this.total,
      notes: this.notes || null,
      status,
      created_by: this.doc?.created_by || this.userEmail
    };
    if (this.docType === 'invoice') {
      Object.assign(base, {
        invoice_type: this.invoice_type,
        invoice_date: this.doc_date,
        due_date: this.due_date || null,
        customer_address: c?.billing_address || this.doc?.customer_address || null,
        customer_gstin: c?.gstin || this.doc?.customer_gstin || null,
        customer_country: c?.country || null,
        customer_state: c?.state || null,
        customer_state_code: c?.state_code || null,
        place_of_supply: c ? `${c.state_code || ''}-${c.state || ''}` : null,
        payment_terms: this.payment_terms || null,
        amount_in_words: this.amountInWords(this.total),
        updated_at: new Date().toISOString()
      });
    } else if (this.docType === 'estimate') {
      Object.assign(base, {
        estimate_date: this.doc_date,
        valid_until: this.valid_until || null,
        customer_address: c?.billing_address || null,
        customer_gstin: c?.gstin || null,
        customer_state_code: c?.state_code || null
      });
    } else {
      Object.assign(base, {
        invoice_id: this.source_invoice_id,
        credit_date: this.doc_date,
        reason: this.reason || null
      });
    }
    return base;
  }

  validate(): boolean {
    if (!this.customer_id && !this.doc?.customer_name) { this.errorMsg = 'Select a customer.'; return false; }
    if (this.docType === 'credit_note' && !this.source_invoice_id) { this.errorMsg = 'Select the original invoice.'; return false; }
    if (!this.lines.some(l => l.description?.trim() && (l.quantity || 0) > 0)) { this.errorMsg = 'Add at least one line item.'; return false; }
    this.errorMsg = '';
    return true;
  }

  async save(finalize = false) {
    if (!this.validate()) return;
    this.saving = true;
    this.recalcAll();
    const finalStatus = finalize
      ? (this.docType === 'credit_note' ? 'issued' : 'sent')
      : (this.doc?.status && this.doc.status !== 'draft' ? this.doc.status : 'draft');
    const payload = this.buildPayload(finalStatus);
    let id = this.docId;
    let error: any = null;

    if (this.isNew) {
      const res = await this.supabase.getClient().from(this.table).insert(payload).select().single();
      error = res.error;
      if (res.data) { id = res.data.id; this.doc = res.data; this.isNew = false; this.docId = id; }
    } else {
      const res = await this.supabase.getClient().from(this.table).update(payload).eq('id', id).select().single();
      error = res.error;
      if (res.data) this.doc = res.data;
    }

    if (!error && this.docType === 'invoice' && id) {
      const res = await this.supabase.replaceInvoiceLineItems(id, this.lines.map(({ id: _i, ...rest }: any) => rest));
      error = res.error;
    }
    if (error) { this.saving = false; this.errorMsg = error.message; return; }

    await this.supabase.logAudit({
      entity_type: this.docType, entity_id: id, entity_ref: this.docNumber,
      action: finalize ? (this.docType === 'credit_note' ? 'issued' : 'finalized') : 'saved',
      performed_by: this.userEmail,
      new_values: { customer: payload.customer_name, total: this.total, status: finalStatus }
    });

    if (finalize && this.docType === 'invoice') {
      await this.postFinalizeInvoice(id);
    }
    this.saving = false;
    this.toast.show(finalize ? `${this.docLabel} finalized — ${this.docNumber}` : 'Saved as draft.', 'success');
    if (!finalize) this.router.navigate(['/billing']);
  }

  // On finalize: stock-out tracked goods and notify accounts/md
  private async postFinalizeInvoice(id: string) {
    for (const l of this.lines) {
      if (!l.item_id) continue;
      const item = this.catalog.find((i: any) => i.id === l.item_id);
      if (!item?.track_inventory || item.item_type === 'service') continue;
      await this.supabase.recordInventoryMovement({
        item_id: l.item_id, movement_type: 'out', quantity: l.quantity,
        reference_type: 'invoice', reference_id: this.docNumber,
        notes: `Invoice ${this.docNumber}`, moved_by: this.userEmail
      });
    }
    const token = await this.supabase.getAuthToken();
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ event: 'invoice_sent', invoiceNumber: this.docNumber, customerName: this.selectedCustomer?.name, total: this.total, dueDate: this.due_date })
    }).catch(() => {});
  }

  printDoc() { window.print(); }

  goBack() { this.router.navigate(['/billing']); }
}
