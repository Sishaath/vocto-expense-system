const ALLOWED_ORIGINS = [
  'https://portal.voctotechnologies.com',
  'https://vocto-expense-system.vercel.app'
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

async function verifySupabaseToken(token, supabaseUrl, serviceRoleKey) {
  const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) return null;
  return r.json();
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

  const user = await verifySupabaseToken(token, supabaseUrl, serviceRoleKey);
  if (!user?.email) return res.status(401).json({ error: 'Unauthorized' });

  const { email } = req.body || {};
  const targetEmail = email || user.email;

  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?email=eq.${encodeURIComponent(targetEmail)}&select=role&limit=1`,
      { headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${serviceRoleKey}` } }
    );
    const data = await r.json();
    const role = Array.isArray(data) && data.length > 0 ? data[0].role : null;
    return res.status(200).json({ role });
  } catch (e) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
}
