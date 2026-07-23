import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, CrmLead } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

const STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

@Component({
  selector: 'app-crm',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './crm.component.html',
  styleUrls: ['./crm.component.scss']
})
export class CrmComponent implements OnInit {
  tab: 'pipeline' | 'contacts' = 'pipeline';
  stages = STAGES;
  leads: any[] = [];
  contacts: any[] = [];
  customers: any[] = [];
  loading = true;
  userEmail = '';
  search = '';

  showForm = false;
  saving = false;
  form: Partial<CrmLead> = this.blankForm();

  constructor(private supabase: SupabaseService, public router: Router, private toast: ToastService) {}

  blankForm(): Partial<CrmLead> {
    return { name: '', company: '', email: '', phone: '', source: '', stage: 'new', value_estimate: null, notes: '' };
  }

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    await this.load();
  }

  async load() {
    this.loading = true;
    const [l, c, cu] = await Promise.all([this.supabase.getLeads(), this.supabase.getContacts(), this.supabase.getCustomers()]);
    this.leads = l.data || [];
    this.contacts = c.data || [];
    this.customers = cu.data || [];
    this.loading = false;
  }

  leadsInStage(stage: string): any[] {
    const list = this.leads.filter(x => x.stage === stage);
    if (!this.search) return list;
    const q = this.search.toLowerCase();
    return list.filter(x => x.name?.toLowerCase().includes(q) || x.company?.toLowerCase().includes(q));
  }

  stageValue(stage: string): number {
    return this.leadsInStage(stage).reduce((s, l) => s + (l.value_estimate || 0), 0);
  }

  stageLabel(s: string): string {
    return ({ new: 'New', contacted: 'Contacted', qualified: 'Qualified', proposal: 'Proposal', won: 'Won', lost: 'Lost' } as any)[s] || s;
  }

  get filteredContacts() {
    if (!this.search) return this.contacts;
    const q = this.search.toLowerCase();
    return this.contacts.filter(c => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
  }

  customerName(id: string): string {
    return this.customers.find(c => c.id === id)?.name || '—';
  }

  openNew() { this.form = this.blankForm(); this.showForm = true; }
  editLead(l: any) { this.form = { ...l }; this.showForm = true; }

  async save() {
    if (!this.form.name?.trim()) { this.toast.show('Lead name is required', 'error'); return; }
    this.saving = true;
    const payload: any = { ...this.form, owner_email: this.form.owner_email || this.userEmail };
    delete payload.created_at; delete payload.updated_at;
    const { data, error } = await this.supabase.upsertLead(payload);
    this.saving = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'crm_lead', entity_id: data?.id || '', entity_ref: payload.name, action: this.form.id ? 'updated' : 'created', performed_by: this.userEmail, new_values: { stage: payload.stage } });
    this.toast.show('Lead saved.', 'success');
    this.showForm = false;
    await this.load();
  }

  async moveStage(lead: any, stage: string) {
    if (lead.stage === stage) return;
    const old = lead.stage;
    const { error } = await this.supabase.getClient().from('crm_leads').update({ stage }).eq('id', lead.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'crm_lead', entity_id: lead.id, entity_ref: lead.name, action: 'stage_changed', performed_by: this.userEmail, old_values: { stage: old }, new_values: { stage } });
    if (stage === 'won' && !lead.customer_id) {
      if (confirm(`Lead won! Create a customer record for "${lead.company || lead.name}"?`)) {
        await this.convertToCustomer(lead);
      }
    }
    await this.load();
  }

  async convertToCustomer(lead: any) {
    const { data, error } = await this.supabase.upsertCustomer({
      name: lead.company || lead.name,
      email: lead.email || undefined,
      phone: lead.phone || undefined,
      contact_person: lead.name,
      notes: lead.notes || undefined,
      created_by: this.userEmail
    });
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.getClient().from('crm_leads').update({ customer_id: data.id }).eq('id', lead.id);
    await this.supabase.getClient().from('crm_contacts').insert([{ customer_id: data.id, lead_id: lead.id, name: lead.name, email: lead.email, phone: lead.phone }]);
    await this.supabase.logAudit({ entity_type: 'crm_lead', entity_id: lead.id, entity_ref: lead.name, action: 'converted_to_customer', performed_by: this.userEmail, new_values: { customer_id: data.id } });
    this.toast.show('Customer created from lead.', 'success');
  }

  async deleteLead(l: any, ev: Event) {
    ev.stopPropagation();
    if (!confirm(`Delete lead "${l.name}"? This cannot be undone.`)) return;
    const { error } = await this.supabase.getClient().from('crm_leads').delete().eq('id', l.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'crm_lead', entity_id: l.id, entity_ref: l.name, action: 'deleted', performed_by: this.userEmail });
    await this.load();
  }

  goBack() { this.router.navigate(['/accounts']); }
}
