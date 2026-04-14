import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

export interface Vendor {
  id: string;
  name: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  created_at?: string;
}

export interface VendorPriceHistory {
  id: string;
  vendor_id: string;
  po_id: string;
  po_number: string;
  po_date: string;
  item_description: string;
  hsn_code?: string;
  unit?: string;
  quantity?: number;
  unit_price: number;
  gst_rate?: number;
  amount?: number;
  currency: string;
  inr_unit_price?: number;
  created_at: string;
}

export interface VendorRating {
  id: string;
  vendor_id: string;
  po_id: string;
  po_number: string;
  rating: number;
  notes?: string;
  rated_by: string;
  rated_at: string;
}

export interface ExpenseBudget {
  id?: string;
  year: number;
  month: number;
  category: string;
  budget_amount: number;
  set_by?: string;
}

export interface RecurringTemplate {
  id?: string;
  created_by: string;
  title: string;
  category: string;
  amount: number;
  vendor?: string;
  pay_mode: string;
  description?: string;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  next_due_date: string;
  last_generated_at?: string;
  active: boolean;
  created_at?: string;
}

export interface POItem {
  id: string;
  description: string;
  hsn_code: string;
  quantity: number;
  unit: string;
  unit_price: number;
  gst_rate: number;
  amount: number;
}

export interface PurchaseOrder {
  id?: string;
  po_number?: string;
  date: string;
  valid_till?: string;
  vendor_gstin?: string;
  vendor_pan?: string;
  vendor_name: string;
  vendor_address?: string;
  vendor_city?: string;
  vendor_state?: string;
  vendor_state_code?: string;
  vendor_email?: string;
  vendor_phone?: string;
  bill_to_address?: string;
  ship_to_address?: string;
  delivery_address?: string;
  payment_terms?: string;
  delivery_terms?: string;
  mode_of_shipment?: string;
  carrier?: string;
  shipment_terms?: string;
  port_of_dispatch?: string;
  freight_charges?: number;
  packing_charges?: number;
  items: POItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  amount_in_words?: string;
  deadline_date?: string;
  comments?: string;
  notes?: string;
  terms?: string;
  status?: string;
  submitted_by?: string;
  submitted_by_email?: string;
  acc_verified_by?: string;
  md_approved_by?: string;
  created_at?: string;
  currency?: string;
  exchange_rate?: number;
  foreign_subtotal?: number;
  foreign_total?: number;
  vendor_invoice_url?: string;
  vendor_invoice_name?: string;
  vendor_invoice_number?: string;
  vendor_invoice_date?: string;
}

const SUPABASE_URL = environment.supabaseUrl;
const SUPABASE_KEY = environment.supabaseKey;

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        lock: <R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn()
      }
    });
  }

  getClient() {
    return this.supabase;
  }

  async signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  async signOut() {
    return this.supabase.auth.signOut();
  }

  async getClaims() {
    return this.supabase
      .from('claims')
      .select('*')
      .order('created_at', { ascending: false });
  }

  async getMyClaims(email: string) {
    return this.supabase
      .from('claims')
      .select('*')
      .eq('employee_email', email)
      .order('created_at', { ascending: false });
  }

  async submitClaim(claim: any) {
    return this.supabase.from('claims').insert(claim);
  }

  async getClaimById(id: string) {
    return this.supabase.from('claims').select('*').eq('id', id).single();
  }

  async updateClaimDetails(id: string, updates: any) {
    return this.supabase.from('claims').update(updates).eq('id', id);
  }

  async updateClaimStatus(id: string, status: string) {
    return this.supabase
      .from('claims')
      .update({ status })
      .eq('id', id);
  }

  async getComments(claimId: string) {
    return this.supabase
      .from('comments')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true });
  }

  async addComment(claimId: string, userId: string, message: string) {
    return this.supabase.from('comments').insert({
      claim_id: claimId,
      user_id: userId,
      message
    });
  }

  async uploadFile(claimId: string, file: File) {
    const ext = file.name.split('.').pop();
    const uniqueName = `${Date.now()}.${ext}`;
    const path = `${claimId}/${uniqueName}`;
    return this.supabase.storage
      .from('claim-documents')
      .upload(path, file, { upsert: true });
  }

  getFileUrl(path: string): string {
    return this.supabase.storage
      .from('claim-documents')
      .getPublicUrl(path).data.publicUrl;
  }

  async getSignedFileUrl(path: string): Promise<string> {
    const { data } = await this.supabase.storage
      .from('claim-documents')
      .createSignedUrl(path, 60 * 60); // 1 hour
    return data?.signedUrl ?? '';
  }

  async getPurchaseOrders() {
    return this.supabase.from('purchase_orders').select('*').order('created_at', { ascending: false });
  }

  async getMyPurchaseOrders(email: string) {
    return this.supabase.from('purchase_orders').select('*').eq('submitted_by', email).order('created_at', { ascending: false });
  }

  // VENDORS
  async upsertVendor(vendor: { name: string; gstin?: string; pan?: string; email?: string; phone?: string; city?: string; state?: string }) {
    const { data, error } = await this.supabase.from('vendors')
      .upsert([vendor], { onConflict: 'name,gstin', ignoreDuplicates: false })
      .select().single();
    return { data, error };
  }

  async getVendors() {
    return this.supabase.from('vendors').select('*').order('name');
  }

  async getVendorById(id: string) {
    return this.supabase.from('vendors').select('*').eq('id', id).single();
  }

  // PRICE HISTORY
  async insertPriceHistory(rows: Partial<VendorPriceHistory>[]) {
    return this.supabase.from('vendor_price_history').insert(rows);
  }

  async getPriceHistoryForVendor(vendorId: string) {
    return this.supabase.from('vendor_price_history')
      .select('*').eq('vendor_id', vendorId).order('po_date', { ascending: false });
  }

  // RATINGS
  async upsertRating(rating: Partial<VendorRating>) {
    return this.supabase.from('vendor_ratings').upsert([rating], { onConflict: 'vendor_id,po_id,rated_by' }).select().single();
  }

  async getRatingsForVendor(vendorId: string) {
    return this.supabase.from('vendor_ratings').select('*').eq('vendor_id', vendorId).order('rated_at', { ascending: false });
  }

  async getRatingForPO(poId: string, ratedBy: string) {
    return this.supabase.from('vendor_ratings').select('*').eq('po_id', poId).eq('rated_by', ratedBy).maybeSingle();
  }

  // BUDGETS
  async getBudgets(year: number, month: number) {
    return this.supabase.from('expense_budgets').select('*').eq('year', year).eq('month', month);
  }

  async upsertBudget(budget: ExpenseBudget) {
    return this.supabase.from('expense_budgets').upsert([budget], { onConflict: 'year,month,category' });
  }

  // RECURRING TEMPLATES
  async getMyTemplates(email: string) {
    return this.supabase.from('recurring_templates').select('*').eq('created_by', email).order('next_due_date');
  }

  async getAllTemplates() {
    return this.supabase.from('recurring_templates').select('*').order('next_due_date');
  }

  async upsertTemplate(template: Partial<RecurringTemplate>) {
    return this.supabase.from('recurring_templates').upsert([template]).select().single();
  }

  async advanceTemplateDueDate(id: string, newDate: string) {
    return this.supabase.from('recurring_templates').update({ next_due_date: newDate }).eq('id', id);
  }

  async deactivateTemplate(id: string) {
    return this.supabase.from('recurring_templates').update({ active: false }).eq('id', id);
  }

  async deleteTemplate(id: string) {
    return this.supabase.from('recurring_templates').delete().eq('id', id);
  }

  // CATEGORIES
  async getActiveCategories(): Promise<string[]> {
    const { data } = await this.supabase.from('expense_categories')
      .select('name').eq('active', true).order('sort_order').order('name');
    return data ? data.map((c: any) => c.name) : [];
  }

  // NOTIFICATIONS
  async createNotification(n: { recipient_email: string; title: string; body?: string; entity_type?: string; entity_id?: string; entity_ref?: string }) {
    return this.supabase.from('notifications').insert([n]);
  }

  async createNotifications(recipients: string[], n: { title: string; body?: string; entity_type?: string; entity_id?: string; entity_ref?: string }) {
    const rows = recipients.map(r => ({ ...n, recipient_email: r }));
    return this.supabase.from('notifications').insert(rows);
  }

  async getMyNotifications(email: string) {
    return this.supabase.from('notifications')
      .select('*').eq('recipient_email', email)
      .order('created_at', { ascending: false }).limit(50);
  }

  async markNotificationRead(id: string) {
    return this.supabase.from('notifications').update({ read: true }).eq('id', id);
  }

  async markNotificationsReadForEntity(email: string, entityId: string) {
    return this.supabase.from('notifications')
      .update({ read: true })
      .eq('recipient_email', email).eq('entity_id', entityId).eq('read', false);
  }

  // AUDIT LOGS
  async logAudit(entry: {
    entity_type: string;
    entity_id: string;
    entity_ref?: string;
    action: string;
    performed_by: string;
    old_values?: any;
    new_values?: any;
    notes?: string;
  }) {
    return this.supabase.from('audit_logs').insert([entry]);
  }

  async getAuditLogs(entityType: string, entityId: string) {
    return this.supabase.from('audit_logs')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false });
  }

  // USER ROLES
  async getUserRole(email: string): Promise<string | null> {
    const { data } = await this.supabase.from('user_roles').select('role').eq('email', email).single();
    return data?.role || null;
  }

  async getAllUserRoles() {
    return this.supabase.from('user_roles').select('*').order('created_at', { ascending: false });
  }

  async updateUserRole(email: string, role: string, updatedBy: string) {
    return this.supabase.from('user_roles').update({ role, updated_at: new Date().toISOString(), invited_by: updatedBy }).eq('email', email);
  }
}