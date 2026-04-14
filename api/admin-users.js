export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-notify-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = process.env.NOTIFY_SECRET;
  if (secret && req.headers['x-notify-secret']?.trim() !== secret.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Not configured' });

  // GET last login info for all users
  if (req.method === 'POST' && req.body?.action === 'list') {
    try {
      let allUsers = [];
      let page = 1;
      while (true) {
        const r = await fetch(`${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`, {
          headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
        });
        const data = await r.json();
        const users = data.users || [];
        allUsers = allUsers.concat(users);
        if (users.length < 1000) break;
        page++;
      }
      const map = {};
      allUsers.forEach(u => {
        map[u.email] = { lastLogin: u.last_sign_in_at, userId: u.id, confirmed: !!u.confirmed_at };
      });
      return res.status(200).json({ map });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // DELETE user from auth
  if (req.method === 'DELETE' || (req.method === 'POST' && req.body?.action === 'delete')) {
    const { userId, email } = req.body || {};
    if (!userId && !email) return res.status(400).json({ error: 'userId or email required' });

    try {
      let uid = userId;
      // If only email provided, find the user ID first
      if (!uid && email) {
        const r = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
          headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
        });
        const data = await r.json();
        uid = data.users?.[0]?.id;
      }
      if (!uid) return res.status(404).json({ error: 'User not found in auth' });

      // Delete from auth
      const delAuth = await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
      });

      // Delete from user_roles
      await fetch(`${supabaseUrl}/rest/v1/user_roles?email=eq.${encodeURIComponent(email || '')}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
      });

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
