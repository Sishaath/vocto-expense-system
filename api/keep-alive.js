// Vercel Cron: runs every 5 days to prevent Supabase free tier from pausing
// Schedule configured in vercel.json
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // Only allow cron calls
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    // Lightweight ping — just count user_roles rows
    const { count, error } = await supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    console.log(`[keep-alive] Supabase ping OK — ${count} users`);
    return res.status(200).json({ ok: true, users: count, ts: new Date().toISOString() });
  } catch (err) {
    console.error('[keep-alive] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
