export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-notify-secret');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.NOTIFY_SECRET;
  if (secret && req.headers['x-notify-secret']?.trim() !== secret.trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email required' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Not configured' });
  }

  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/user_roles?email=eq.${encodeURIComponent(email)}&select=role&limit=1`, {
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      }
    });
    const data = await r.json();
    const role = Array.isArray(data) && data.length > 0 ? data[0].role : null;
    return res.status(200).json({ role });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
