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
    // 1. Invite user via Supabase Admin API
    const inviteRes = await fetch(`${supabaseUrl}/auth/v1/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`
      },
      body: JSON.stringify({
        email,
        data: { role },
        redirect_to: `${appUrl}/set-password`
      })
    });

    const inviteData = await inviteRes.json();

    // If user already exists in auth, that's fine — we still update their role below
    if (!inviteRes.ok && !inviteData.msg?.toLowerCase().includes('already')) {
      return res.status(400).json({ error: inviteData.msg || inviteData.error_description || 'Failed to invite user' });
    }

    // 2. Upsert role in user_roles table
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

    // 3. Send invite notification email via Resend
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const roleLabel = { employee: 'Employee', accounts: 'Accounts', md: 'Managing Director', admin: 'Admin' }[role] || role;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Vocto Expense System <onboarding@resend.dev>',
          to: [email],
          subject: 'You have been invited to Vocto Expense System',
          html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a1a1a">
            <div style="background:#0C1F3D;padding:16px 24px;border-radius:8px 8px 0 0">
              <span style="color:#fff;font-weight:700;font-size:16px">Vocto Technologies</span>
              <span style="color:#F4721B;margin-left:8px;font-size:12px">Expense System</span>
            </div>
            <div style="background:#fff;border:1px solid #E8ECF3;border-top:none;padding:24px;border-radius:0 0 8px 8px">
              <h2 style="margin:0 0 16px;font-size:18px;color:#0C1F3D">You have been invited</h2>
              <p style="margin:0 0 16px;color:#4A6080">You have been added to the Vocto Expense System as <strong>${roleLabel}</strong>.</p>
              <p style="margin:0 0 20px;color:#4A6080">Click the button below to set your password and activate your account.</p>
              <a href="${appUrl}/set-password" style="display:inline-block;background:#F4721B;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Set My Password →</a>
              <p style="margin-top:20px;color:#8A9BB0;font-size:12px">If you did not expect this invitation, please ignore this email.</p>
            </div>
          </div>`
        })
      }).catch(() => {});
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error: ' + e.message });
  }
}
