import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Vendor } from '../supabase.service';

@Component({
  selector: 'app-vendors',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './vendors.component.html',
  styleUrls: ['./vendors.component.scss']
})
export class VendorsComponent implements OnInit {
  vendors: any[] = [];
  loading = true;
  search = '';
  userEmail = '';

  constructor(private supabase: SupabaseService, public router: Router) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    await this.loadVendors();
  }

  async loadVendors() {
    this.loading = true;
    const { data } = await this.supabase.getVendors();
    if (data) {
      // For each vendor, fetch aggregate rating and last PO
      const vendorIds = data.map((v: any) => v.id);
      const ratingsRes = await this.supabase.getClient()
        .from('vendor_ratings').select('vendor_id, rating');
      const phRes = await this.supabase.getClient()
        .from('vendor_price_history').select('vendor_id, po_date, po_number').order('po_date', { ascending: false });

      const ratings = ratingsRes.data || [];
      const ph = phRes.data || [];

      this.vendors = data.map((v: any) => {
        const vRatings = ratings.filter((r: any) => r.vendor_id === v.id);
        const avgRating = vRatings.length ? vRatings.reduce((s: number, r: any) => s + r.rating, 0) / vRatings.length : 0;
        const lastPH = ph.find((p: any) => p.vendor_id === v.id);
        return { ...v, avgRating: Math.round(avgRating * 10) / 10, ratingCount: vRatings.length, lastPoDate: lastPH?.po_date, lastPoNumber: lastPH?.po_number };
      });
    }
    this.loading = false;
  }

  get filtered() {
    if (!this.search) return this.vendors;
    const q = this.search.toLowerCase();
    return this.vendors.filter(v => v.name?.toLowerCase().includes(q) || v.gstin?.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q));
  }

  stars(n: number) { return Array(5).fill(0).map((_, i) => i < Math.round(n)); }

  goBack() {
    this.router.navigate(['/dashboard']);
  }
}
