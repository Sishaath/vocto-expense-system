import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, CatalogItem, ProductionOrder } from '../supabase.service';
import { ToastService } from '../shared/toast.service';

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss']
})
export class InventoryComponent implements OnInit {
  tab: 'items' | 'movements' | 'production' = 'items';
  items: any[] = [];
  movements: any[] = [];
  productionOrders: any[] = [];
  loading = true;
  userEmail = '';
  search = '';

  showItemForm = false;
  savingItem = false;
  itemForm: Partial<CatalogItem> = this.blankItem();

  showMovementForm = false;
  savingMovement = false;
  movementForm = this.blankMovement();

  showProdForm = false;
  savingProd = false;
  prodForm: Partial<ProductionOrder> = this.blankProd();

  constructor(private supabase: SupabaseService, public router: Router, private toast: ToastService) {}

  blankItem(): Partial<CatalogItem> {
    return { name: '', sku: '', description: '', item_type: 'goods', hsn_sac_code: '', unit: 'Nos', unit_price: 0, gst_rate: 18, track_inventory: true, stock_qty: 0, reorder_level: 0, active: true };
  }
  blankMovement() {
    return { item_id: '', movement_type: 'in', quantity: 0, notes: '' };
  }
  blankProd(): Partial<ProductionOrder> {
    return { item_id: '', quantity_planned: 0, status: 'planned', start_date: '', notes: '' };
  }

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    await this.load();
  }

  async load() {
    this.loading = true;
    const [it, mv, po] = await Promise.all([
      this.supabase.getItems(),
      this.supabase.getInventoryMovements(),
      this.supabase.getProductionOrders()
    ]);
    this.items = it.data || [];
    this.movements = mv.data || [];
    this.productionOrders = po.data || [];
    this.loading = false;
  }

  itemName(id: string): string { return this.items.find(i => i.id === id)?.name || '—'; }

  get lowStockItems(): any[] {
    return this.items.filter(i => i.active !== false && i.track_inventory && i.item_type === 'goods' && Number(i.stock_qty) <= Number(i.reorder_level || 0));
  }

  get filteredItems() {
    if (!this.search) return this.items;
    const q = this.search.toLowerCase();
    return this.items.filter(i => i.name?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q) || i.hsn_sac_code?.toLowerCase().includes(q));
  }

  isLow(i: any): boolean {
    return i.track_inventory && i.item_type === 'goods' && Number(i.stock_qty) <= Number(i.reorder_level || 0);
  }

  // ---- items ----
  openNewItem() { this.itemForm = this.blankItem(); this.showItemForm = true; }
  editItem(i: any) { this.itemForm = { ...i }; this.showItemForm = true; }

  async saveItem() {
    if (!this.itemForm.name?.trim()) { this.toast.show('Item name is required', 'error'); return; }
    this.savingItem = true;
    const payload: any = { ...this.itemForm, created_by: this.itemForm.created_by || this.userEmail };
    delete payload.created_at; delete payload.updated_at;
    if (payload.id) delete payload.stock_qty; // stock changes only via movements
    const { data, error } = await this.supabase.upsertItem(payload);
    this.savingItem = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'item', entity_id: data?.id || '', entity_ref: payload.name, action: this.itemForm.id ? 'updated' : 'created', performed_by: this.userEmail, new_values: { sku: payload.sku, price: payload.unit_price } });
    this.toast.show('Item saved.', 'success');
    this.showItemForm = false;
    await this.load();
  }

  // ---- manual stock movements ----
  openMovement(item?: any) {
    this.movementForm = this.blankMovement();
    if (item) this.movementForm.item_id = item.id;
    this.showMovementForm = true;
  }

  async saveMovement() {
    const f = this.movementForm;
    if (!f.item_id) { this.toast.show('Select an item', 'error'); return; }
    if (!f.quantity || (f.movement_type !== 'adjustment' && f.quantity <= 0)) { this.toast.show('Enter a valid quantity', 'error'); return; }
    this.savingMovement = true;
    const { error } = await this.supabase.recordInventoryMovement({
      item_id: f.item_id, movement_type: f.movement_type, quantity: f.quantity,
      reference_type: 'manual', notes: f.notes, moved_by: this.userEmail
    });
    this.savingMovement = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'inventory_movement', entity_id: f.item_id, entity_ref: this.itemName(f.item_id), action: f.movement_type, performed_by: this.userEmail, new_values: { quantity: f.quantity } });
    this.toast.show('Stock movement recorded.', 'success');
    this.showMovementForm = false;
    await this.load();
  }

  movementLabel(m: any): string {
    return ({ in: 'Stock In', out: 'Stock Out', adjustment: 'Adjustment' } as any)[m.movement_type] || m.movement_type;
  }

  // ---- production ----
  openNewProd() { this.prodForm = this.blankProd(); this.showProdForm = true; }

  async saveProd() {
    if (!this.prodForm.item_id) { this.toast.show('Select an item', 'error'); return; }
    if (!this.prodForm.quantity_planned || this.prodForm.quantity_planned <= 0) { this.toast.show('Enter planned quantity', 'error'); return; }
    this.savingProd = true;
    const payload: any = { ...this.prodForm, created_by: this.userEmail };
    delete payload.created_at; delete payload.updated_at;
    const { data, error } = await this.supabase.upsertProductionOrder(payload);
    this.savingProd = false;
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'production_order', entity_id: data?.id || '', entity_ref: data?.order_number, action: 'created', performed_by: this.userEmail, new_values: { item: this.itemName(payload.item_id), qty: payload.quantity_planned } });
    this.toast.show('Production order created.', 'success');
    this.showProdForm = false;
    await this.load();
  }

  async startProd(po: any) {
    const { error } = await this.supabase.getClient().from('production_orders')
      .update({ status: 'in_progress', start_date: new Date().toISOString().split('T')[0] }).eq('id', po.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'production_order', entity_id: po.id, entity_ref: po.order_number, action: 'started', performed_by: this.userEmail });
    await this.load();
  }

  async completeProd(po: any) {
    const qtyStr = prompt(`Quantity produced for ${po.order_number}?`, String(po.quantity_planned));
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) { this.toast.show('Invalid quantity', 'error'); return; }
    const { error } = await this.supabase.getClient().from('production_orders')
      .update({ status: 'completed', quantity_produced: qty, completed_date: new Date().toISOString().split('T')[0] }).eq('id', po.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.recordInventoryMovement({
      item_id: po.item_id, movement_type: 'in', quantity: qty,
      reference_type: 'production_order', reference_id: po.order_number,
      notes: `Production ${po.order_number}`, moved_by: this.userEmail
    });
    await this.supabase.logAudit({ entity_type: 'production_order', entity_id: po.id, entity_ref: po.order_number, action: 'completed', performed_by: this.userEmail, new_values: { quantity_produced: qty } });
    this.toast.show(`Production complete — ${qty} added to stock.`, 'success');
    await this.load();
  }

  async cancelProd(po: any) {
    if (!confirm(`Cancel production order ${po.order_number}?`)) return;
    const { error } = await this.supabase.getClient().from('production_orders').update({ status: 'cancelled' }).eq('id', po.id);
    if (error) { this.toast.show(error.message, 'error'); return; }
    await this.supabase.logAudit({ entity_type: 'production_order', entity_id: po.id, entity_ref: po.order_number, action: 'cancelled', performed_by: this.userEmail });
    await this.load();
  }

  prodStatusLabel(s: string): string {
    return ({ planned: 'Planned', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled' } as any)[s] || s;
  }

  goBack() { this.router.navigate(['/accounts']); }
}
