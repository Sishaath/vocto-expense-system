import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';

const ACCOUNTS_EMAILS = ['yogeshwari@voctotechnologies.com', 'accounts@voctotechnologies.com'];
const MD_EMAILS = ['rrk@voctotechnologies.com', 'md@voctotechnologies.com'];

async function getSession() {
  const supabase = inject(SupabaseService);
  const { data: { session } } = await supabase.getClient().auth.getSession();
  return session;
}

export const authGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const session = await getSession();
  if (!session) { router.navigate(['/login']); return false; }
  return true;
};

export const accountsGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const session = await getSession();
  if (!session) { router.navigate(['/login']); return false; }
  if (!ACCOUNTS_EMAILS.includes(session.user.email || '')) {
    router.navigate(['/dashboard']); return false;
  }
  return true;
};

export const mdGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const session = await getSession();
  if (!session) { router.navigate(['/login']); return false; }
  if (!MD_EMAILS.includes(session.user.email || '')) {
    router.navigate(['/dashboard']); return false;
  }
  return true;
};
