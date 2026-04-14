import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.scss'
})
export class CategoriesComponent implements OnInit {
  categories: any[] = [];
  newName = '';
  saving = false;

  constructor(private supabase: SupabaseService, private toast: ToastService, public router: Router) {}

  async ngOnInit() {
    const { data } = await this.supabase.getClient()
      .from('expense_categories').select('*').order('sort_order').order('name');
    if (data) this.categories = data;
  }

  async addCategory() {
    const name = this.newName.trim();
    if (!name) return;
    if (this.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      this.toast.show('Category already exists', 'error'); return;
    }
    this.saving = true;
    const maxOrder = this.categories.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    const { data, error } = await this.supabase.getClient()
      .from('expense_categories').insert([{ name, sort_order: maxOrder + 1 }]).select().single();
    this.saving = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    this.categories = [...this.categories, data];
    this.newName = '';
    this.toast.show('Category added', 'success');
  }

  async toggleActive(cat: any) {
    const { error } = await this.supabase.getClient()
      .from('expense_categories').update({ active: !cat.active }).eq('id', cat.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    cat.active = !cat.active;
    this.toast.show(cat.active ? 'Category enabled' : 'Category disabled', 'success');
  }

  async rename(cat: any) {
    const name = cat._editName?.trim();
    if (!name || name === cat.name) { cat._editing = false; return; }
    const { error } = await this.supabase.getClient()
      .from('expense_categories').update({ name }).eq('id', cat.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    cat.name = name;
    cat._editing = false;
    this.toast.show('Renamed', 'success');
  }

  startEdit(cat: any) { cat._editing = true; cat._editName = cat.name; }
  cancelEdit(cat: any) { cat._editing = false; }
}
