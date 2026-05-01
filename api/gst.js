const ALLOWED_ORIGINS = [
  'https://portal.voctotechnologies.com',
  'https://vocto-expense-system.vercel.app'
];

function setCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Vary', 'Origin');
}

export default async function handler(req, res) {
  setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gstApiKey = process.env.GST_API_KEY;

  if (!supabaseUrl || !serviceRoleKey || !gstApiKey) return res.status(500).json({ error: 'Not configured' });

  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const authRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { 'apikey': serviceRoleKey, 'Authorization': `Bearer ${token}` }
  });
  if (!authRes.ok) return res.status(401).json({ error: 'Unauthorized' });

  const { gstin } = req.query;
  if (!gstin) return res.status(400).json({ error: 'GSTIN required' });

  const cleanGstin = gstin.toUpperCase().trim();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanGstin)) {
    return res.status(400).json({ error: 'Invalid GSTIN format' });
  }

  try {
    const response = await fetch(`https://sheet.gstincheck.co.in/check/${gstApiKey}/${cleanGstin}`);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
}
