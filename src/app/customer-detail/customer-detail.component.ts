import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-customer-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './customer-detail.component.html',
  styleUrls: ['./customer-detail.component.scss']
})
export class CustomerDetailComponent implements OnInit {
  customer: any = null;
  invoices: any[] = [];
  contacts: any[] = [];
  loading = true;
  userEmail = '';
  readOnly = false;  // md sees everything, edits nothing

  showContactForm = false;
  savingContact = false;
  contactForm = this.blankContact();

  constructor(
    private supabase: SupabaseService,
    public router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  blankContact() { return { name: '', designation: '', email: '', phone: '', notes: '' }; }

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    this.readOnly = (await this.supabase.getUserRole(this.userEmail)) === 'md';
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/customers']); return; }
    await this.load(id);
  }

  async load(id: string) {
    this.loading = true;
    const { data, error } = await this.supabase.getCustomerById(id);
    if (error || !data) { this.toast.show('Customer not found.', 'error'); this.router.navigate(['/customers']); return; }
    this.customer = data;
    const [inv, con] = await Promise.all([
      this.supabase.getInvoicesForCustomer(id),
      this.supabase.getContactsForCustomer(id)
    ]);
    this.invoices = inv.data || [];
    this.contacts = con.data || [];
    this.loading = false;
  }

  get totalBilled(): number {
    return this.invoices.filter(i => !['draft','cancelled'].includes(i.status)).reduce((s, i) => s + (i.total || 0), 0);
  }

  get outstanding(): number {
    return this.invoices.filter(i => !['draft','cancelled','paid'].includes(i.status))
      .reduce((s, i) => s + ((i.total || 0) - (i.amount_paid || 0)), 0);
  }

  statusLabel(s: string): string {
    return ({ draft: 'Draft', sent: 'Sent', partially_paid: 'Partially Paid', paid: 'Paid', overdue: 'Overdue', cancelled: 'Cancelled' } as any)[s] || s;
  }

  isOverdue(inv: any): boolean {
    return !['draft','cancelled','paid'].includes(inv.status) && inv.due_date && new Date(inv.due_date) < new Date();
  }

  async saveContact() {
    if (!this.contactForm.name.trim()) { this.toast.show('Contact name is required', 'error'); return; }
    this.savingContact = true;
    const { error } = await this.supabase.getClient().from('crm_contacts')
      .insert([{ ...this.contactForm, customer_id: this.customer.id }]);
    this.savingContact = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Contact added.', 'success');
    this.showContactForm = false;
    this.contactForm = this.blankContact();
    await this.load(this.customer.id);
  }

  async deleteContact(c: any) {
    if (!confirm(`Remove contact "${c.name}"?`)) return;
    const { error } = await this.supabase.getClient().from('crm_contacts').delete().eq('id', c.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'crm_contact', entity_id: c.id, entity_ref: c.name, action: 'deleted', performed_by: this.userEmail, old_values: { name: c.name } });
    await this.load(this.customer.id);
  }

  // DPDP: export all personal data held for this customer as JSON
  async exportData() {
    const [payments] = await Promise.all([
      this.supabase.getClient().from('payments').select('*').eq('customer_id', this.customer.id)
    ]);
    const bundle = {
      exported_at: new Date().toISOString(),
      exported_by: this.userEmail,
      customer: this.customer,
      contacts: this.contacts,
      invoices: this.invoices,
      payments: payments.data || []
    };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `customer-data-${(this.customer.name || 'export').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    await this.supabase.logAudit({ entity_type: 'customer', entity_id: this.customer.id, entity_ref: this.customer.name, action: 'data_exported', performed_by: this.userEmail, notes: 'DPDP data export' });
  }

  // DPDP: delete customer. Blocked when invoices exist (GST records
  // must be retained) — deactivates and scrubs contact PII instead.
  async deleteCustomer() {
    if (this.invoices.length > 0) {
      if (!confirm(`"${this.customer.name}" has ${this.invoices.length} invoice(s), which must be retained for GST records. Deactivate the customer and erase personal contact details instead?`)) return;
      const { error } = await this.supabase.getClient().from('customers')
        .update({ active: false, email: null, phone: null, contact_person: null, notes: null })
        .eq('id', this.customer.id);
      if (error) { this.toast.show(error.message, 'error'); return; }
      await this.supabase.getClient().from('crm_contacts').delete().eq('customer_id', this.customer.id);
      await this.supabase.logAudit({ entity_type: 'customer', entity_id: this.customer.id, entity_ref: this.customer.name, action: 'pii_erased', performed_by: this.userEmail, notes: 'DPDP erasure — invoices retained' });
      this.toast.show('Customer deactivated and personal data erased.', 'success');
      await this.load(this.customer.id);
      return;
    }
    if (!confirm(`Permanently delete "${this.customer.name}" and all their contacts? This cannot be undone.`)) return;
    const { error } = await this.supabase.deleteCustomer(this.customer.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'customer', entity_id: this.customer.id, entity_ref: this.customer.name, action: 'deleted', performed_by: this.userEmail, notes: 'DPDP deletion' });
    this.toast.show('Customer deleted.', 'warning');
    this.router.navigate(['/customers']);
  }

  newInvoice() {
    this.router.navigate(['/billing/invoice/create'], { state: { customerId: this.customer.id } });
  }

  goBack() { this.router.navigate(['/customers']); }
}
