import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../supabase.service';
import { environment } from '../../environments/environment';

async function getRoleFromApi(email: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(`${environment.apiBaseUrl}/api/get-role`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ email })
    });
    const json = await res.json();
    return json.role || null;
  } catch {
    return null;
  }
}

async function getSessionAndRole() {
  const supabase = inject(SupabaseService);
  const { data: { session } } = await supabase.getClient().auth.getSession();
  if (!session) return { session: null, role: null };
  const role = await getRoleFromApi(session.user.email || '', session.access_token);
  return { session, role };
}

export const authGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const { session, role } = await getSessionAndRole();
  if (!session) { router.navigate(['/login']); return false; }
  if (role === 'admin') { router.navigate(['/admin']); return false; }
  return true;
};

export const accountsGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const { session, role } = await getSessionAndRole();
  if (!session) { router.navigate(['/login']); return false; }
  if (role === 'admin') { router.navigate(['/admin']); return false; }
  if (role !== 'accounts') { router.navigate(['/dashboard']); return false; }
  return true;
};

export const mdGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const { session, role } = await getSessionAndRole();
  if (!session) { router.navigate(['/login']); return false; }
  if (role === 'admin') { router.navigate(['/admin']); return false; }
  if (role !== 'md') { router.navigate(['/dashboard']); return false; }
  return true;
};

export const adminGuard = async (): Promise<boolean> => {
  const router = inject(Router);
  const { session, role } = await getSessionAndRole();
  if (!session) { router.navigate(['/login']); return false; }
  if (role !== 'admin') {
    router.navigate(['/dashboard']); return false;
  }
  return true;
};
