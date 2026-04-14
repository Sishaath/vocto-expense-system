import { Injectable } from '@angular/core';

// Indian state codes mapped from GSTIN first 2 digits
const STATE_CODES: { [key: string]: string } = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
  '99': 'Centre Jurisdiction'
};

export interface GSTInfo {
  gstin: string;
  tradeName?: string;
  legalName?: string;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  status?: string;
  pincode?: string;
}

@Injectable({ providedIn: 'root' })
export class GstService {

  validateGSTIN(gstin: string): boolean {
    const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return pattern.test(gstin.toUpperCase());
  }

  getStateFromGSTIN(gstin: string): { state: string; code: string } {
    const code = gstin.substring(0, 2);
    return { state: STATE_CODES[code] || 'Unknown', code };
  }

  async lookupGSTIN(gstin: string): Promise<GSTInfo | null> {
    const g = gstin.toUpperCase().trim();
    if (!this.validateGSTIN(g)) return null;

    const { state, code } = this.getStateFromGSTIN(g);

    try {
      const resp = await fetch(
        `/api/gst?gstin=${g}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data?.flag === true && data?.data) {
          const d = data.data;
          return {
            gstin: g,
            tradeName: d.tradeNam || '',
            legalName: d.lgnm || '',
            address: this.formatAddress(d.pradr),
            city: d.pradr?.addr?.dst || d.pradr?.addr?.loc || '',
            state: d.pradr?.addr?.stcd || state,
            stateCode: code,
            status: d.sts || '',
            pincode: d.pradr?.addr?.pncd || ''
          };
        }
      }
    } catch { /* fall through */ }

    // Fallback — at least return state from GSTIN
    return { gstin: g, state, stateCode: code };
  }

  private formatAddress(pradr: any): string {
    if (!pradr) return '';
    const a = pradr.addr || pradr;
    const parts = [a.bno, a.bnm, a.st, a.loc, a.dst, a.stcd, a.pncd]
      .filter(v => v && v !== '0').join(', ');
    return parts;
  }
}
