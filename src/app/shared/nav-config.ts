export type RailIcon =
  | 'dashboard' | 'requisition' | 'vendors' | 'billing' | 'crm'
  | 'inventory' | 'admin' | 'profile' | 'recurring';

export interface RailModule {
  id: string;
  label: string;
  route: string;
  icon: RailIcon;
}

const EMPLOYEE_MODULES: RailModule[] = [
  { id: 'dashboard', label: 'Vouchers & POs', route: '/dashboard', icon: 'dashboard' },
  { id: 'requisition', label: 'Advance Requisition', route: '/advance-requisition', icon: 'requisition' },
  { id: 'recurring', label: 'Recurring Templates', route: '/recurring', icon: 'recurring' },
  { id: 'vendors', label: 'Vendor Directory', route: '/vendors', icon: 'vendors' },
  { id: 'profile', label: 'Profile', route: '/profile', icon: 'profile' },
];

const ACCOUNTS_MODULES: RailModule[] = [
  { id: 'dashboard', label: 'Accounts Dashboard', route: '/accounts', icon: 'dashboard' },
  { id: 'billing', label: 'Billing & Receivables', route: '/billing', icon: 'billing' },
  { id: 'crm', label: 'Sales Pipeline', route: '/crm', icon: 'crm' },
  { id: 'inventory', label: 'Inventory & Production', route: '/inventory', icon: 'inventory' },
  { id: 'vendors', label: 'Vendor Directory', route: '/vendors', icon: 'vendors' },
  { id: 'profile', label: 'Profile', route: '/profile', icon: 'profile' },
];

const MD_MODULES: RailModule[] = [
  { id: 'dashboard', label: 'MD Approvals', route: '/md', icon: 'dashboard' },
  { id: 'billing', label: 'Billing & Receivables', route: '/billing', icon: 'billing' },
  { id: 'crm', label: 'Sales Pipeline', route: '/crm', icon: 'crm' },
  { id: 'inventory', label: 'Inventory & Production', route: '/inventory', icon: 'inventory' },
  { id: 'vendors', label: 'Vendor Directory', route: '/vendors', icon: 'vendors' },
  { id: 'profile', label: 'Profile', route: '/profile', icon: 'profile' },
];

const ADMIN_MODULES: RailModule[] = [
  { id: 'admin', label: 'Admin Panel', route: '/admin', icon: 'admin' },
];

export function getRailModules(role: string | null): RailModule[] {
  switch (role) {
    case 'accounts': return ACCOUNTS_MODULES;
    case 'md': return MD_MODULES;
    case 'admin': return ADMIN_MODULES;
    default: return EMPLOYEE_MODULES;
  }
}
