import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../supabase.service';
import { AppShellComponent } from '../shared/app-shell/app-shell.component';
import { getRailModules, RailModule } from '../shared/nav-config';
import { ToastService } from '../shared/toast.service';

const CATEGORIES = [
  'Travel & Transport', 'Accommodation', 'Meals & Entertainment',
  'Office Supplies', 'Software / Subscriptions', 'Training & Conference', 'Medical', 'Other'
];

@Component({
  selector: 'app-budgets',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppShellComponent],
  templateUrl: './budgets.component.html',
  styleUrls: ['./budgets.component.scss']
})
export class BudgetsComponent implements OnInit {
  categories = CATEGORIES;
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;
  userEmail = '';
  role: string | null = null;
  modules: RailModule[] = [];
  loading = true;
  saving = false;

  budgetMap: Record<string, number> = {};
  actualMap: Record<string, number> = {};

  months = [
    { v: 1, l: 'January' }, { v: 2, l: 'February' }, { v: 3, l: 'March' },
    { v: 4, l: 'April' }, { v: 5, l: 'May' }, { v: 6, l: 'June' },
    { v: 7, l: 'July' }, { v: 8, l: 'August' }, { v: 9, l: 'September' },
    { v: 10, l: 'October' }, { v: 11, l: 'November' }, { v: 12, l: 'December' }
  ];

  get years() {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1];
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
    // Load budgets
    const { data: budgets } = await this.supabase.getClient()
      .from('expense_budgets')
      .select('*')
      .eq('year', this.selectedYear)
      .eq('month', this.selectedMonth);

    this.budgetMap = {};
    for (const cat of this.categories) this.budgetMap[cat] = 0;
    for (const b of (budgets || [])) this.budgetMap[b.category] = b.budget_amount;

    // Load actuals from approved/paid claims for this month
    const startDate = `${this.selectedYear}-${String(this.selectedMonth).padStart(2, '0')}-01`;
    const endDate = new Date(this.selectedYear, this.selectedMonth, 0).toISOString().split('T')[0];

    const { data: claims } = await this.supabase.getClient()
      .from('claims')
      .select('category, amount, status, created_at')
      .in('status', ['MD_APPROVED', 'PAID'])
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59');

    this.actualMap = {};
    for (const cat of this.categories) this.actualMap[cat] = 0;
    for (const c of (claims || [])) {
      if (this.actualMap[c.category] !== undefined) {
        this.actualMap[c.category] += c.amount;
      }
    }

    this.loading = false;
  }

  pct(cat: string): number {
    const budget = this.budgetMap[cat];
    if (!budget) return this.actualMap[cat] > 0 ? 100 : 0;
    return Math.min(100, Math.round((this.actualMap[cat] / budget) * 100));
  }

  remaining(cat: string): number {
    return Math.max(0, (this.budgetMap[cat] || 0) - (this.actualMap[cat] || 0));
  }

  isOverBudget(cat: string): boolean {
    return this.budgetMap[cat] > 0 && this.actualMap[cat] > this.budgetMap[cat];
  }

  get totalBudget() { return this.categories.reduce((s, c) => s + (this.budgetMap[c] || 0), 0); }
  get totalActual() { return this.categories.reduce((s, c) => s + (this.actualMap[c] || 0), 0); }

  async saveAll() {
    this.saving = true;
    for (const cat of this.categories) {
      const amount = this.budgetMap[cat] || 0;
      await this.supabase.getClient().from('expense_budgets').upsert([{
        year: this.selectedYear,
        month: this.selectedMonth,
        category: cat,
        budget_amount: amount,
        set_by: this.userEmail
      }], { onConflict: 'year,month,category' });
    }
    this.saving = false;
    this.toast.show('Budgets saved!', 'success');
  }

  async onMonthChange() { await this.load(); }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
