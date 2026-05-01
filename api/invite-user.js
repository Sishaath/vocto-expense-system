const ALLOWED_ORIGINS = [
  'https://portal.voctotechnologies.com',
  'https://vocto-expense-system.vercel.app'
];

const VALID_ROLES = ['employee', 'accounts', 'md', 'admin'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Not configured' });

  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const adminUser = await verifyAdminToken(token, supabaseUrl, serviceRoleKey);
  if (!adminUser) return res.status(403).json({ error: 'Forbidden — admin only' });

  const { email, role, invitedBy } = req.body || {};

  if (!email || !role) return res.status(400).json({ error: 'email and role are required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address' });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });

  const appUrl = process.env.APP_URL || 'https://vocto-expense-system.vercel.app';

  try {
    const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ email, data: { role } })
    });

    const inviteText = await inviteRes.text();
    let inviteData = {};
    try { inviteData = JSON.parse(inviteText); } catch {}

    if (!inviteRes.ok && !inviteText.toLowerCase().includes('already')) {
      return res.status(400).json({ error: inviteData.msg || inviteData.error_description || 'Failed to invite user' });
    }

    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/user_roles`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        email,
        role,
        invited_by: invitedBy || adminUser.email,
        updated_at: new Date().toISOString()
      })
    });

    if (!upsertRes.ok) {
      return res.status(500).json({ error: 'Role save failed' });
    }

    return res.status(200).json({ ok: true, inviteLink: `${appUrl}/set-password` });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error' });
  }
}
