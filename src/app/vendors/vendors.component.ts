import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Vendor } from '../supabase.service';
import { AppShellComponent } from '../shared/app-shell/app-shell.component';
import { getRailModules, RailModule } from '../shared/nav-config';

@Component({
  selector: 'app-vendors',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AppShellComponent],
  templateUrl: './vendors.component.html',
  styleUrls: ['./vendors.component.scss']
})
export class VendorsComponent implements OnInit {
  vendors: any[] = [];
  loading = true;
  search = '';
  userEmail = '';
  role: string | null = null;
  modules: RailModule[] = [];

  constructor(private supabase: SupabaseService, public router: Router) {}

  async ngOnInit() {
    const { data: { session } } = await this.supabase.getClient().auth.getSession();
    if (!session) { this.router.navigate(['/login']); return; }
    this.userEmail = session.user.email || '';
    this.role = await this.supabase.getUserRole(this.userEmail);
    this.modules = getRailModules(this.role);
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

  exportVendorSpendReport() {
    const vendorsWithSpend = this.vendors
      .map(v => {
        const spend = v.totalSpend || 0;
        return { ...v, spend };
      })
      .sort((a, b) => b.spend - a.spend);

    const rows = vendorsWithSpend.map(v => `
      <tr>
        <td>${v.name}</td>
        <td>${v.gstin || '—'}</td>
        <td>${v.city || '—'}</td>
        <td style="text-align:right">₹${Number(v.spend).toLocaleString('en-IN')}</td>
        <td style="text-align:center">${v.ratingCount ? v.avgRating + ' ★' : '—'}</td>
        <td>${v.lastPoNumber || '—'}</td>
      </tr>`).join('');

    const total = vendorsWithSpend.reduce((s, v) => s + v.spend, 0);
    const html = `<html><head><title>Vendor Spend Report</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 32px; color: #1a1a1a; font-size: 13px; }
        h2 { color: #0C1F3D; margin-bottom: 4px; }
        .sub { color: #888; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #0C1F3D; color: #fff; padding: 8px 10px; text-align: left; font-size: 11px; }
        td { padding: 8px 10px; border-bottom: 1px solid #eee; }
        tr:nth-child(even) td { background: #f9f9f9; }
        .total-row td { font-weight: 700; background: #FEF0E6; border-top: 2px solid #F4721B; }
        .footer { margin-top: 24px; font-size: 11px; color: #bbb; }
      </style></head>
      <body>
        <h2>Vocto Technologies — Vendor Spend Report</h2>
        <div class="sub">Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
        <table>
          <thead><tr><th>Vendor</th><th>GSTIN</th><th>City</th><th>Total Spend</th><th>Rating</th><th>Last PO</th></tr></thead>
          <tbody>${rows}
            <tr class="total-row">
              <td colspan="3">Total</td>
              <td style="text-align:right">₹${total.toLocaleString('en-IN')}</td>
              <td colspan="2">${vendorsWithSpend.length} vendors</td>
            </tr>
          </tbody>
        </table>
        <div class="footer">Vocto Technologies · vocto-expense-system.vercel.app</div>
      </body></html>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
