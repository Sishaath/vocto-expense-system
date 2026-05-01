const ALLOWED_ORIGINS = [
  'https://portal.voctotechnologies.com',
  'https://vocto-expense-system.vercel.app'
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

async function verifyAdminToken(token, supabaseUrl, serviceRoleKey) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) return null;
  const user = await r.json();
  if (!user?.email) return null;

  const roleRes = await fetch(
    `${supabaseUrl}/rest/v1/user_roles?email=eq.${encodeURIComponent(user.email)}&select=role&limit=1`,
    { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
  );
  const roleData = await roleRes.json();
  const role = Array.isArray(roleData) && roleData.length > 0 ? roleData[0].role : null;
  if (role !== 'admin') return null;
  return user;
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Not configured' });

  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const adminUser = await verifyAdminToken(token, supabaseUrl, serviceRoleKey);
  if (!adminUser) return res.status(403).json({ error: 'Forbidden — admin only' });

  // LIST users
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
      return res.status(500).json({ error: 'Failed to list users' });
    }
  }

  // DELETE user
  if (req.method === 'DELETE' || (req.method === 'POST' && req.body?.action === 'delete')) {
    const { userId, email } = req.body || {};
    if (!userId && !email) return res.status(400).json({ error: 'userId or email required' });

    // Prevent admin from deleting themselves
    if (email && email === adminUser.email) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    try {
      let uid = userId;
      if (!uid && email) {
        const r = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
          headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
        });
        const data = await r.json();
        uid = data.users?.[0]?.id;
      }
      if (!uid) return res.status(404).json({ error: 'User not found' });

      await fetch(`${supabaseUrl}/auth/v1/admin/users/${uid}`, {
        method: 'DELETE',
        headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
      });

      if (email) {
        await fetch(`${supabaseUrl}/rest/v1/user_roles?email=eq.${encodeURIComponent(email)}`, {
          method: 'DELETE',
          headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` }
        });
      }

      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: 'Delete failed' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
