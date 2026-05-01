// Vercel Cron: runs every 5 days to prevent Supabase free tier from pausing
// Schedule configured in vercel.json
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

export default async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(401).json({ error: 'Unauthorized' });
  const provided = Buffer.from(req.headers['authorization'] || '');
  const expected = Buffer.from(`Bearer ${cronSecret}`);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
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
