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

  const { email, role, invitedBy } = req.body || {};
  if (!email || !role) return res.status(400).json({ error: 'email and role are required' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase service role not configured' });
  }

  const appUrl = process.env.APP_URL || 'https://vocto-expense-system.vercel.app';

  try {
    // 1. Generate invite link — also triggers Supabase to create the user
    const generateRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        type: 'invite',
        email,
        data: { role },
        redirect_to: `${appUrl}/set-password`
      })
    });

    const generateText = await generateRes.text();
    let generateData = {};
    try { generateData = JSON.parse(generateText); } catch {}

    if (!generateRes.ok && !generateText.toLowerCase().includes('already')) {
      return res.status(400).json({ error: generateData.msg || generateData.error_description || 'Failed to generate invite link' });
    }

    const inviteLink = generateData.action_link || `${appUrl}/set-password`;

    // 2. Send invite email via Supabase native invite endpoint
    await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({ email, data: { role } })
    }).catch(() => {});

    // 3. Upsert role in user_roles table
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
        invited_by: invitedBy || null,
        updated_at: new Date().toISOString()
      })
    });

    if (!upsertRes.ok) {
      const upsertData = await upsertRes.json();
      return res.status(500).json({ error: 'Role save failed', detail: upsertData });
    }

    return res.status(200).json({ ok: true, inviteLink });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
}
