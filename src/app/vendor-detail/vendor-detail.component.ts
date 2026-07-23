import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Vendor, VendorPriceHistory, VendorRating } from '../supabase.service';
import { AppShellComponent } from '../shared/app-shell/app-shell.component';
import { getRailModules, RailModule } from '../shared/nav-config';

@Component({
  selector: 'app-vendor-detail',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule, AppShellComponent],
  templateUrl: './vendor-detail.component.html',
  styleUrls: ['./vendor-detail.component.scss']
})
export class VendorDetailComponent implements OnInit {
  vendor: Vendor | null = null;
  priceHistory: VendorPriceHistory[] = [];
  ratings: VendorRating[] = [];
  loading = true;
  activeTab: 'price' | 'ratings' = 'price';
  searchItem = '';
  userEmail = '';
  role: string | null = null;
  modules: RailModule[] = [];

  constructor(private supabase: SupabaseService, public router: Router, private route: ActivatedRoute) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    this.role = await this.supabase.getUserRole(this.userEmail);
    this.modules = getRailModules(this.role);
    const id = this.route.snapshot.paramMap.get('id')!;
    const [vendorRes, phRes, ratingsRes] = await Promise.all([
      this.supabase.getVendorById(id),
      this.supabase.getPriceHistoryForVendor(id),
      this.supabase.getRatingsForVendor(id)
    ]);
    this.vendor = vendorRes.data as Vendor;
    this.priceHistory = (phRes.data || []) as VendorPriceHistory[];
    this.ratings = (ratingsRes.data || []) as VendorRating[];
    this.loading = false;
  }

  get filteredHistory() {
    if (!this.searchItem) return this.priceHistory;
    const q = this.searchItem.toLowerCase();
    return this.priceHistory.filter(p => p.item_description?.toLowerCase().includes(q) || p.po_number?.toLowerCase().includes(q));
  }

  get avgRating() {
    if (!this.ratings.length) return 0;
    return Math.round(this.ratings.reduce((s, r) => s + r.rating, 0) / this.ratings.length * 10) / 10;
  }

  stars(n: number) { return Array(5).fill(0).map((_, i) => i < Math.round(n)); }

  get uniqueItems() {
    const map = new Map<string, { desc: string; prices: number[]; lastDate: string }>();
    for (const p of this.priceHistory) {
      const key = p.item_description;
      if (!map.has(key)) map.set(key, { desc: key, prices: [], lastDate: p.po_date });
      map.get(key)!.prices.push(p.inr_unit_price || p.unit_price);
    }
    return Array.from(map.values()).map(v => ({
      ...v,
      min: Math.min(...v.prices),
      max: Math.max(...v.prices),
      avg: Math.round(v.prices.reduce((a, b) => a + b, 0) / v.prices.length * 100) / 100
    }));
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
