export default async function handler(req, res) {
  const { gstin } = req.query;
  if (!gstin) return res.status(400).json({ error: 'GSTIN required' });

  try {
    const response = await fetch(
      `https://sheet.gstincheck.co.in/check/1e10e7f9c0bbcf98202ea6a4d2a0b96a/${gstin.toUpperCase().trim()}`
    );
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: 'Lookup failed' });
  }
}
