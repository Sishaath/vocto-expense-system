import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService, POItem, PurchaseOrder } from '../supabase.service';
import { GstService } from '../gst.service';
import { ToastService } from '../shared/toast.service';
import { SharedSidebarComponent } from '../shared-sidebar/shared-sidebar.component';

const DEFAULT_TERMS = `1. All goods/services must be delivered as per the specifications mentioned in this PO.
2. Invoice must reference this PO number.
3. Quality inspection will be done at the time of delivery.
4. Warranty/guarantee as applicable must be provided.
5. Payment will be processed within the agreed credit period after receipt and acceptance of goods/services.`;

@Component({
  selector: 'app-create-po',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SharedSidebarComponent],
  templateUrl: './create-po.component.html',
  styleUrl: './create-po.component.scss'
})
export class CreatePoComponent implements OnInit {
  isEdit = false;
  editId = '';
  saving = false;
  gstLookupLoading = false;
  userEmail = '';
  currency = 'INR';
  exchangeRate = 1.0;
  readonly CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY'];
  readonly CURRENCY_SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥' };

  // PO fields
  date = new Date().toISOString().split('T')[0];
  validTill = '';
  deadlineDate = '';
  vendorGstin = '';
  vendorPan = '';
  vendorName = '';
  vendorAddress = '';
  vendorCity = '';
  vendorState = '';
  vendorStateCode = '';
  vendorEmail = '';
  vendorPhone = '';

  // Addresses (default to vendor)
  billToAddress = '';
  shipToAddress = '';

  // Shipment details
  modeOfShipment = 'Road';
  carrier = '';
  shipmentTerms = '';
  portOfDispatch = '';

  // Charges (as % of subtotal)
  freightPct = 0;
  packingPct = 0;

  paymentTerms = 'Net 30 days';
  deliveryTerms = 'Ex-Works';
  notes = '';
  comments = '';
  terms = DEFAULT_TERMS;
  gstLookupDone = false;
  gstLookupFailed = false;

  items: POItem[] = [this.newItem()];

  readonly VOCTO_STATE_CODE = '33';

  get subtotal() { return this.items.reduce((s, i) => s + i.amount, 0); }
  get isInterState() { return this.vendorStateCode && this.vendorStateCode !== this.VOCTO_STATE_CODE; }

  get cgst() { return this.isInterState ? 0 : this.items.reduce((s, i) => s + (i.amount * i.gst_rate / 200), 0); }
  get sgst() { return this.isInterState ? 0 : this.items.reduce((s, i) => s + (i.amount * i.gst_rate / 200), 0); }
  get igst() { return this.isInterState ? this.items.reduce((s, i) => s + (i.amount * i.gst_rate / 100), 0) : 0; }
  get freightAmount() { return Math.round(this.subtotal * this.freightPct / 100 * 100) / 100; }
  get packingAmount() { return Math.round(this.subtotal * this.packingPct / 100 * 100) / 100; }
  get taxTotal() { return this.cgst + this.sgst + this.igst; }
  get total() { return this.subtotal + this.taxTotal + this.freightAmount + this.packingAmount; }

  get currencySymbol() { return this.CURRENCY_SYMBOLS[this.currency] || this.currency; }
  get foreignSubtotal() { return this.currency === 'INR' ? null : Math.round(this.subtotal / this.exchangeRate * 100) / 100; }
  get foreignTotal() { return this.currency === 'INR' ? null : Math.round(this.total / this.exchangeRate * 100) / 100; }

  constructor(
    private supabase: SupabaseService,
    private gstSvc: GstService,
    private router: Router,
    private route: ActivatedRoute,
    private toast: ToastService
  ) {}

  async ngOnInit() {
    const { data } = await this.supabase.getClient().auth.getSession();
    if (!data.session) { this.router.navigate(['/login']); return; }
    this.userEmail = data.session.user?.email || '';

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.isEdit = true;
      this.editId = id;
      await this.loadPO(id);
    }
  }

  async loadPO(id: string) {
    const { data, error } = await this.supabase.getClient()
      .from('purchase_orders').select('*').eq('id', id).single();
    if (error || !data) { this.toast.show('PO not found', 'error'); this.back(); return; }
    const o = data as PurchaseOrder;
    this.date = o.date;
    this.validTill = o.valid_till || '';
    this.vendorGstin = o.vendor_gstin || '';
    this.vendorPan = o.vendor_pan || '';
    this.vendorName = o.vendor_name;
    this.vendorAddress = o.vendor_address || '';
    this.vendorCity = o.vendor_city || '';
    this.vendorState = o.vendor_state || '';
    this.vendorStateCode = o.vendor_state_code || '';
    this.vendorEmail = o.vendor_email || '';
    this.vendorPhone = o.vendor_phone || '';
    this.billToAddress = o.bill_to_address || '';
    this.shipToAddress = o.ship_to_address || '';
    this.modeOfShipment = o.mode_of_shipment || 'Road';
    this.carrier = o.carrier || '';
    this.shipmentTerms = o.shipment_terms || '';
    this.portOfDispatch = o.port_of_dispatch || '';
    this.freightPct = o.freight_charges || 0;
    this.packingPct = o.packing_charges || 0;
    this.paymentTerms = o.payment_terms || 'Net 30 days';
    this.deliveryTerms = o.delivery_terms || 'Ex-Works';
    this.deadlineDate = o.deadline_date || '';
    this.notes = o.notes || '';
    this.comments = o.comments || '';
    this.terms = o.terms || DEFAULT_TERMS;
    this.items = o.items?.length ? o.items : [this.newItem()];
    this.currency = o.currency || 'INR';
    this.exchangeRate = o.exchange_rate || 1.0;
  }

  newItem(): POItem {
    return { id: crypto.randomUUID(), description: '', hsn_code: '', quantity: 1, unit: 'Nos', unit_price: 0, gst_rate: 18, amount: 0 };
  }

  addItem() { this.items = [...this.items, this.newItem()]; }
  recalcAllItems() { this.items.forEach((_, i) => this.calcItemAmount(i)); }

  removeItem(idx: number) {
    if (this.items.length === 1) return;
    this.items = this.items.filter((_, i) => i !== idx);
  }

  calcItemAmount(idx: number) {
    const item = this.items[idx];
    const baseAmount = Math.round(item.quantity * item.unit_price * 100) / 100;
    item.amount = this.currency === 'INR' ? baseAmount : Math.round(baseAmount * this.exchangeRate * 100) / 100;
    this.items = [...this.items];
  }

  syncAddresses() {
    const addr = [this.vendorName, this.vendorAddress, this.vendorCity, this.vendorState].filter(Boolean).join('\n');
    if (!this.billToAddress) this.billToAddress = addr;
    if (!this.shipToAddress) this.shipToAddress = addr;
  }

  async lookupGSTIN() {
    const g = this.vendorGstin.trim().toUpperCase();
    if (!g) return;
    if (!this.gstSvc.validateGSTIN(g)) {
      this.toast.show('Invalid GSTIN format', 'error');
      return;
    }
    this.gstLookupLoading = true;
    this.gstLookupDone = false;
    this.gstLookupFailed = false;
    const info = await this.gstSvc.lookupGSTIN(g);
    this.gstLookupLoading = false;
    if (info) {
      this.vendorStateCode = info.stateCode || '';
      this.vendorState = info.state || '';
      if (info.tradeName || info.legalName) {
        this.vendorName = info.tradeName || info.legalName || '';
        this.vendorAddress = info.address || '';
        this.vendorCity = info.city || '';
        this.gstLookupDone = true;
        this.syncAddresses();
        this.toast.show(`Found: ${this.vendorName}`, 'success');
      } else {
        this.gstLookupFailed = true;
        this.toast.show(`State: ${info.state} — Fill vendor details manually`, 'info');
      }
    } else {
      this.gstLookupFailed = true;
      this.toast.show('GSTIN lookup failed — fill manually', 'warning');
    }
  }

  amountToWords(n: number): string {
    const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const inWords = (num: number): string => {
      if (num === 0) return '';
      if (num < 20) return a[num] + ' ';
      if (num < 100) return b[Math.floor(num / 10)] + ' ' + a[num % 10] + ' ';
      if (num < 1000) return a[Math.floor(num / 100)] + ' Hundred ' + inWords(num % 100);
      if (num < 100000) return inWords(Math.floor(num / 1000)) + 'Thousand ' + inWords(num % 1000);
      if (num < 10000000) return inWords(Math.floor(num / 100000)) + 'Lakh ' + inWords(num % 100000);
      return inWords(Math.floor(num / 10000000)) + 'Crore ' + inWords(num % 10000000);
    };

    const rupees = Math.floor(n);
    const paise = Math.round((n - rupees) * 100);
    let result = 'Indian Rupees ' + inWords(rupees).trim();
    if (paise > 0) result += ' and ' + inWords(paise).trim() + ' Paise';
    return result + ' Only';
  }

  buildPayload(status: string) {
    return {
      date: this.date,
      valid_till: this.validTill || null,
      vendor_gstin: this.vendorGstin || null,
      vendor_pan: this.vendorPan || null,
      vendor_name: this.vendorName,
      vendor_address: this.vendorAddress,
      vendor_city: this.vendorCity,
      vendor_state: this.vendorState,
      vendor_state_code: this.vendorStateCode,
      vendor_email: this.vendorEmail || null,
      vendor_phone: this.vendorPhone || null,
      bill_to_address: this.billToAddress,
      ship_to_address: this.shipToAddress,
      mode_of_shipment: this.modeOfShipment,
      carrier: this.carrier || null,
      shipment_terms: this.shipmentTerms || null,
      port_of_dispatch: this.portOfDispatch || null,
      freight_charges: this.freightPct,
      packing_charges: this.packingPct,
      payment_terms: this.paymentTerms,
      delivery_terms: this.deliveryTerms,
      items: this.items,
      subtotal: this.subtotal,
      cgst: this.cgst,
      sgst: this.sgst,
      igst: this.igst,
      total: this.total,
      currency: this.currency,
      exchange_rate: this.exchangeRate,
      foreign_subtotal: this.foreignSubtotal,
      foreign_total: this.foreignTotal,
      amount_in_words: this.amountToWords(this.total),
      deadline_date: this.deadlineDate || null,
      notes: this.notes,
      comments: this.comments,
      terms: this.terms,
      submitted_by: this.userEmail,
      status
    };
  }

  async saveDraft() {
    if (!this.vendorName.trim()) { this.toast.show('Vendor name is required', 'error'); return; }
    if (!this.validTill) { this.toast.show('Valid Till date is required', 'error'); return; }
    this.saving = true;
    if (this.isEdit) {
      const { error } = await this.supabase.getClient()
        .from('purchase_orders').update(this.buildPayload('draft')).eq('id', this.editId);
      this.saving = false;
      if (error) { this.toast.show(error.message, 'error'); return; }
      this.toast.show('Draft saved', 'success');
    } else {
      const { error } = await this.supabase.getClient()
        .from('purchase_orders').insert([this.buildPayload('draft')]);
      this.saving = false;
      if (error) { this.toast.show(error.message, 'error'); return; }
      this.toast.show('Draft saved', 'success');
    }
    this.back();
  }

  async submitForReview() {
    if (!this.vendorName.trim()) { this.toast.show('Vendor name is required', 'error'); return; }
    if (this.items.some(i => !i.description.trim())) { this.toast.show('All items need a description', 'error'); return; }
    this.saving = true;
    if (this.isEdit) {
      const { error } = await this.supabase.getClient()
        .from('purchase_orders').update(this.buildPayload('pending')).eq('id', this.editId);
      this.saving = false;
      if (error) { this.toast.show(error.message, 'error'); return; }
    } else {
      const { error } = await this.supabase.getClient()
        .from('purchase_orders').insert([this.buildPayload('pending')]);
      this.saving = false;
      if (error) { this.toast.show(error.message, 'error'); return; }
    }
    this.toast.show('PO submitted for Accounts review!', 'success');
    // Register vendor in directory
    if (this.vendorName.trim()) {
      await this.supabase.upsertVendor({
        name: this.vendorName,
        gstin: this.vendorGstin || undefined,
        pan: this.vendorPan || undefined,
        email: this.vendorEmail || undefined,
        phone: this.vendorPhone || undefined,
        city: this.vendorCity || undefined,
        state: this.vendorState || undefined
      });
    }
    this.back();
  }

  back() { this.router.navigate(['/dashboard']); }
}
