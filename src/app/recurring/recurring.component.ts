import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, RecurringTemplate } from '../supabase.service';
import { AppShellComponent } from '../shared/app-shell/app-shell.component';
import { getRailModules, RailModule } from '../shared/nav-config';
import { ToastService } from '../shared/toast.service';

const CATEGORIES = [
  'Travel & Transport', 'Accommodation', 'Meals & Entertainment',
  'Office Supplies', 'Software / Subscriptions', 'Training & Conference', 'Medical', 'Other'
];

@Component({
  selector: 'app-recurring',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, RouterLink, AppShellComponent],
  templateUrl: './recurring.component.html',
  styleUrls: ['./recurring.component.scss']
})
export class RecurringComponent implements OnInit {
  templates: RecurringTemplate[] = [];
  loading = true;
  showForm = false;
  saving = false;
  userEmail = '';
  role: string | null = null;
  modules: RailModule[] = [];
  categories = CATEGORIES;

  form: Partial<RecurringTemplate> = this.blankForm();

  blankForm(): Partial<RecurringTemplate> {
    return { title: '', category: 'Travel & Transport', amount: 0, vendor: '', pay_mode: 'Company Card', description: '', frequency: 'monthly', next_due_date: '', active: true };
  }

  constructor(private supabase: SupabaseService, private router: Router, private toast: ToastService) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    this.role = await this.supabase.getUserRole(this.userEmail);
    this.modules = getRailModules(this.role);
    await this.load();
  }

  async load() {
    this.loading = true;
    const { data } = await this.supabase.getMyTemplates(this.userEmail);
    if (data) this.templates = data as RecurringTemplate[];
    this.loading = false;
  }

  get activeTemplates() { return this.templates.filter(t => t.active); }
  get inactiveTemplates() { return this.templates.filter(t => !t.active); }

  isDue(t: RecurringTemplate): boolean {
    return new Date(t.next_due_date) <= new Date();
  }

  freqLabel(f: string) { return { monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }[f] || f; }

  submitFromTemplate(t: RecurringTemplate) {
    this.router.navigate(['/submit'], { state: { templateData: t } });
  }

  async saveTemplate() {
    if (!this.form.title?.trim()) { this.toast.show('Title is required', 'error'); return; }
    if (!this.form.amount || this.form.amount <= 0) { this.toast.show('Enter a valid amount', 'error'); return; }
    if (!this.form.next_due_date) { this.toast.show('Set a due date', 'error'); return; }
    this.saving = true;
    const payload = { ...this.form, created_by: this.userEmail };
    const { error } = await this.supabase.upsertTemplate(payload);
    this.saving = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Template saved!', 'success');
    this.showForm = false;
    this.form = this.blankForm();
    await this.load();
  }

  async toggleActive(t: RecurringTemplate) {
    await this.supabase.getClient()
      .from('recurring_templates')
      .update({ active: !t.active })
      .eq('id', t.id);
    await this.load();
  }

  async deleteTemplate(t: RecurringTemplate) {
    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    const { error } = await this.supabase.deleteTemplate(t.id!);
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.toast.show('Template deleted.', 'warning');
    await this.load();
  }

  cancelForm() { this.showForm = false; this.form = this.blankForm(); }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
