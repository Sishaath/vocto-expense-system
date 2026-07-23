import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Customer } from '../supabase.service';
import { ToastService } from '../shared/toast.service';
import { GstService } from '../gst.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.component.html',
  styleUrls: ['./customers.component.scss']
})
export class CustomersComponent implements OnInit {
  customers: any[] = [];
  loading = true;
  search = '';
  userEmail = '';
  readOnly = false;  // md sees everything, edits nothing

  showForm = false;
  saving = false;
  gstLoading = false;
  form: Partial<Customer> = this.blankForm();

  constructor(
    private supabase: SupabaseService,
    public router: Router,
    private toast: ToastService,
    private gst: GstService
  ) {}

  blankForm(): Partial<Customer> {
    return { name: '', gstin: '', email: '', phone: '', contact_person: '', billing_address: '', shipping_address: '', city: '', state: '', state_code: '', country: 'India', customer_type: 'domestic', payment_terms: '', notes: '', active: true };
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
    const { data, error } = await this.supabase.getCustomers();
    if (error) { this.toast.show(error.message, 'error'); }
    this.customers = data || [];
    this.loading = false;
  }

  get filtered() {
    if (!this.search) return this.customers;
    const q = this.search.toLowerCase();
    return this.customers.filter(c => c.name?.toLowerCase().includes(q) || c.gstin?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }

  openNew() { this.form = this.blankForm(); this.showForm = true; }

  editCustomer(c: any, ev: Event) {
    ev.stopPropagation();
    this.form = { ...c };
    this.showForm = true;
  }

  async lookupGstin() {
    const gstin = (this.form.gstin || '').toUpperCase().trim();
    if (!gstin) return;
    if (!this.gst.validateGSTIN(gstin)) { this.toast.show('Invalid GSTIN format', 'error'); return; }
    this.gstLoading = true;
    const info = await this.gst.lookupGSTIN(gstin);
    if (info) {
      if (!this.form.name) this.form.name = info.legalName || info.tradeName || '';
      this.form.state = info.state || this.form.state;
      this.form.state_code = info.stateCode || gstin.substring(0, 2);
      if (info.city && !this.form.city) this.form.city = info.city;
      if (info.address && !this.form.billing_address) this.form.billing_address = info.address;
    }
    this.gstLoading = false;
  }

  async save() {
    if (!this.form.name?.trim()) { this.toast.show('Customer name is required', 'error'); return; }
    this.saving = true;
    const payload: any = { ...this.form, created_by: this.form.created_by || this.userEmail };
    delete payload.created_at; delete payload.updated_at;
    const { data, error } = await this.supabase.upsertCustomer(payload);
    this.saving = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({
      entity_type: 'customer', entity_id: data?.id || '', entity_ref: payload.name,
      action: this.form.id ? 'updated' : 'created', performed_by: this.userEmail,
      new_values: { name: payload.name, gstin: payload.gstin }
    });
    this.toast.show('Customer saved.', 'success');
    this.showForm = false;
    await this.load();
  }

  cancelForm() { this.showForm = false; }
  goBack() { this.router.navigate([this.readOnly ? '/md' : '/accounts']); }
}
