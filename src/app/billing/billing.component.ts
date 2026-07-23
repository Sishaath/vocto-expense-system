import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Payment } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

type Tab = 'invoices' | 'estimates' | 'credit_notes' | 'payments' | 'recurring';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './billing.component.html',
  styleUrls: ['./billing.component.scss']
})
export class BillingComponent implements OnInit {
  tab: Tab = 'invoices';
  loading = true;
  userEmail = '';
  readOnly = false;  // md sees everything, edits nothing
  search = '';

  invoices: any[] = [];
  estimates: any[] = [];
  creditNotes: any[] = [];
  payments: any[] = [];
  recurring: any[] = [];
  customers: any[] = [];

  // Record-payment modal
  payingInvoice: any = null;
  payForm: Partial<Payment> = {};
  savingPayment = false;

  // Recurring template modal
  showRecurringForm = false;
  savingRecurring = false;
  recurringForm: any = this.blankRecurring();

  constructor(private supabase: SupabaseService, public router: Router, private toast: ToastService) {}

  blankRecurring() {
    return { name: '', customer_id: null, invoice_type: 'domestic', items: [], payment_terms: '', due_in_days: 30, notes: '', frequency: 'monthly', next_run_date: '', active: true, source_invoice_id: null };
  }

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    this.readOnly = (await this.supabase.getUserRole(this.userEmail)) === 'md';
    await this.load();
  }

  async load() {
    this.loading = true;
    const [inv, est, cn, pay, rec, cust] = await Promise.all([
      this.supabase.getInvoices(),
      this.supabase.getEstimates(),
      this.supabase.getCreditNotes(),
      this.supabase.getPayments(),
      this.supabase.getRecurringInvoiceTemplates(),
      this.supabase.getCustomers()
    ]);
    this.invoices = inv.data || [];
    this.estimates = est.data || [];
    this.creditNotes = cn.data || [];
    this.payments = pay.data || [];
    this.recurring = rec.data || [];
    this.customers = cust.data || [];
    this.loading = false;
  }

  customerName(id: string): string {
    return this.customers.find(c => c.id === id)?.name || '—';
  }

  // ---- metrics ----
  get outstanding(): number {
    return this.invoices.filter(i => !['draft','cancelled','paid'].includes(i.status))
      .reduce((s, i) => s + ((i.total || 0) - (i.amount_paid || 0)), 0);
  }
  get overdueInvoices(): any[] {
    return this.invoices.filter(i => this.isOverdue(i));
  }
  get overdueAmount(): number {
    return this.overdueInvoices.reduce((s, i) => s + ((i.total || 0) - (i.amount_paid || 0)), 0);
  }
  get monthRevenue(): number {
    const now = new Date();
    return this.invoices
      .filter(i => !['draft','cancelled'].includes(i.status) && i.invoice_date &&
        new Date(i.invoice_date).getMonth() === now.getMonth() &&
        new Date(i.invoice_date).getFullYear() === now.getFullYear())
      .reduce((s, i) => s + (i.total || 0), 0);
  }
  get revenueByMonth(): { label: string; amount: number }[] {
    const out: { label: string; amount: number }[] = [];
    const now = new Date();
    for (let k = 5; k >= 0; k--) {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const amount = this.invoices
        .filter(i => !['draft','cancelled'].includes(i.status) && i.invoice_date &&
          new Date(i.invoice_date).getMonth() === d.getMonth() &&
          new Date(i.invoice_date).getFullYear() === d.getFullYear())
        .reduce((s, i) => s + (i.total || 0), 0);
      out.push({ label: d.toLocaleDateString('en-IN', { month: 'short' }), amount });
    }
    return out;
  }
  get maxMonthRevenue(): number {
    return Math.max(1, ...this.revenueByMonth.map(m => m.amount));
  }

  isOverdue(inv: any): boolean {
    return !['draft','cancelled','paid'].includes(inv.status) && inv.due_date && new Date(inv.due_date) < new Date();
  }

  statusLabel(s: string): string {
    return ({ draft: 'Draft', sent: 'Sent', partially_paid: 'Partially Paid', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', converted: 'Converted', issued: 'Issued', applied: 'Applied' } as any)[s] || s;
  }

  filterList(list: any[], fields: string[]): any[] {
    if (!this.search) return list;
    const q = this.search.toLowerCase();
    return list.filter(x => fields.some(f => (x[f] || '').toString().toLowerCase().includes(q)));
  }

  get filteredInvoices() { return this.filterList(this.invoices, ['invoice_number', 'customer_name', 'status']); }
  get filteredEstimates() { return this.filterList(this.estimates, ['estimate_number', 'customer_name', 'status']); }
  get filteredCreditNotes() { return this.filterList(this.creditNotes, ['credit_note_number', 'customer_name', 'status']); }
  get filteredPayments() { return this.filterList(this.payments, ['payment_number', 'reference_no', 'method']); }

  // ---- payment recording ----
  openPayment(inv: any, ev?: Event) {
    ev?.stopPropagation();
    this.payingInvoice = inv;
    this.payForm = {
      invoice_id: inv.id,
      customer_id: inv.customer_id || null,
      amount: Math.max(0, (inv.total || 0) - (inv.amount_paid || 0)),
      method: 'bank_transfer',
      payment_date: new Date().toISOString().split('T')[0],
      reference_no: '', notes: ''
    };
  }

  async savePayment() {
    if (!this.payForm.amount || this.payForm.amount <= 0) { this.toast.show('Enter a valid amount', 'error'); return; }
    this.savingPayment = true;
    const { data, error } = await this.supabase.recordPayment({ ...this.payForm, recorded_by: this.userEmail });
    this.savingPayment = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({
      entity_type: 'payment', entity_id: data?.id || '', entity_ref: data?.payment_number,
      action: 'recorded', performed_by: this.userEmail,
      new_values: { invoice: this.payingInvoice?.invoice_number, amount: this.payForm.amount, method: this.payForm.method }
    });
    const token = await this.supabase.getAuthToken();
    fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ event: 'payment_received', invoiceNumber: this.payingInvoice?.invoice_number, customerName: this.payingInvoice?.customer_name, amount: this.payForm.amount, paymentNumber: data?.payment_number })
    }).catch(() => {});
    this.toast.show(`Payment ${data?.payment_number} recorded.`, 'success');
    this.payingInvoice = null;
    await this.load();
  }

  // ---- estimate conversion ----
  async convertEstimate(est: any, ev?: Event) {
    ev?.stopPropagation();
    if (est.status === 'converted') return;
    if (!confirm(`Convert estimate ${est.estimate_number} to a draft invoice?`)) return;
    const payload: any = {
      invoice_type: 'domestic',
      invoice_date: new Date().toISOString().split('T')[0],
      customer_id: est.customer_id || null,
      customer_name: est.customer_name,
      customer_address: est.customer_address || null,
      customer_gstin: est.customer_gstin || null,
      customer_state_code: est.customer_state_code || null,
      items: est.items || [],
      subtotal: est.subtotal, cgst: est.cgst, sgst: est.sgst, igst: est.igst, total: est.total,
      notes: est.notes || null,
      status: 'draft',
      created_by: this.userEmail
    };
    const { data, error } = await this.supabase.getClient().from('sales_invoices').insert(payload).select().single();
    if (error) { this.toast.show(error.message, 'error'); return; }
    if (est.items?.length) {
      await this.supabase.replaceInvoiceLineItems(data.id, est.items.map((x: any) => ({
        item_id: x.item_id || null, description: x.description, hsn_sac_code: x.hsn_sac_code || x.hsn_code || '',
        quantity: x.quantity, unit: x.unit, unit_price: x.unit_price, discount_pct: x.discount_pct || 0,
        gst_rate: x.gst_rate, taxable_value: x.taxable_value, cgst: x.cgst, sgst: x.sgst, igst: x.igst, line_total: x.line_total
      })));
    }
    await this.supabase.getClient().from('estimates').update({ status: 'converted', converted_invoice_id: data.id }).eq('id', est.id);
    await this.supabase.logAudit({ entity_type: 'estimate', entity_id: est.id, entity_ref: est.estimate_number, action: 'converted', performed_by: this.userEmail, new_values: { invoice_id: data.id } });
    this.toast.show('Estimate converted to draft invoice.', 'success');
    this.router.navigate(['/billing/invoice', data.id]);
  }

  // ---- recurring invoices ----
  openRecurringForm() {
    this.recurringForm = this.blankRecurring();
    this.showRecurringForm = true;
  }

  onRecurringSource() {
    const inv = this.invoices.find(i => i.id === this.recurringForm.source_invoice_id);
    if (!inv) return;
    this.recurringForm.customer_id = inv.customer_id || null;
    this.recurringForm.invoice_type = inv.invoice_type || 'domestic';
    this.recurringForm.items = inv.items || [];
    this.recurringForm.payment_terms = inv.payment_terms || '';
    if (!this.recurringForm.name) this.recurringForm.name = `${inv.customer_name} — recurring`;
  }

  async saveRecurring() {
    const f = this.recurringForm;
    if (!f.name?.trim() || !f.next_run_date) { this.toast.show('Name and next run date are required', 'error'); return; }
    if (!f.items?.length) { this.toast.show('Pick a source invoice to copy line items from', 'error'); return; }
    this.savingRecurring = true;
    const { source_invoice_id, ...payload } = f;
    const { error } = await this.supabase.getClient().from('recurring_invoice_templates').insert([{ ...payload, created_by: this.userEmail }]);
    this.savingRecurring = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Recurring template saved.', 'success');
    this.showRecurringForm = false;
    await this.load();
  }

  isRecurringDue(t: any): boolean { return new Date(t.next_run_date) <= new Date(); }

  async generateFromRecurring(t: any) {
    const due = new Date();
    due.setDate(due.getDate() + (t.due_in_days || 30));
    const payload: any = {
      invoice_type: t.invoice_type || 'domestic',
      invoice_date: new Date().toISOString().split('T')[0],
      due_date: due.toISOString().split('T')[0],
      customer_id: t.customer_id || null,
      customer_name: this.customerName(t.customer_id),
      items: t.items || [],
      subtotal: (t.items || []).reduce((s: number, x: any) => s + (x.taxable_value || 0), 0),
      cgst: (t.items || []).reduce((s: number, x: any) => s + (x.cgst || 0), 0),
      sgst: (t.items || []).reduce((s: number, x: any) => s + (x.sgst || 0), 0),
      igst: (t.items || []).reduce((s: number, x: any) => s + (x.igst || 0), 0),
      payment_terms: t.payment_terms || null,
      notes: t.notes || null,
      status: 'draft',
      created_by: this.userEmail
    };
    payload.total = payload.subtotal + payload.cgst + payload.sgst + payload.igst;
    const { data, error } = await this.supabase.getClient().from('sales_invoices').insert(payload).select().single();
    if (error) { this.toast.show(error.message, 'error'); return; }
    const next = new Date(t.next_run_date);
    if (t.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
    else if (t.frequency === 'quarterly') next.setMonth(next.getMonth() + 3);
    else next.setFullYear(next.getFullYear() + 1);
    await this.supabase.getClient().from('recurring_invoice_templates')
      .update({ next_run_date: next.toISOString().split('T')[0], last_generated_at: new Date().toISOString() })
      .eq('id', t.id);
    await this.supabase.logAudit({ entity_type: 'invoice', entity_id: data.id, entity_ref: 'draft', action: 'generated_recurring', performed_by: this.userEmail, new_values: { template: t.name } });
    this.toast.show('Draft invoice generated from template.', 'success');
    this.router.navigate(['/billing/invoice', data.id]);
  }

  async toggleRecurring(t: any) {
    await this.supabase.getClient().from('recurring_invoice_templates').update({ active: !t.active }).eq('id', t.id);
    await this.load();
  }

  async cancelInvoice(inv: any, ev: Event) {
    ev.stopPropagation();
    if (inv.status !== 'draft') { this.toast.show('Only draft invoices can be cancelled.', 'error'); return; }
    if (!confirm('Cancel this draft invoice?')) return;
    const { error } = await this.supabase.getClient().from('sales_invoices').update({ status: 'cancelled' }).eq('id', inv.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'invoice', entity_id: inv.id, entity_ref: inv.invoice_number || 'draft', action: 'cancelled', performed_by: this.userEmail });
    await this.load();
  }

  async sendOverdueReminder(inv: any, ev: Event) {
    ev.stopPropagation();
    const token = await this.supabase.getAuthToken();
    await fetch('/api/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ event: 'overdue_reminder', invoiceNumber: inv.invoice_number, customerName: inv.customer_name, total: inv.total, amountPaid: inv.amount_paid, dueDate: inv.due_date, customerEmail: this.customers.find(c => c.id === inv.customer_id)?.email })
    }).catch(() => {});
    this.toast.show('Overdue reminder sent.', 'success');
  }

  goBack() { this.router.navigate([this.readOnly ? '/md' : '/accounts']); }
}
