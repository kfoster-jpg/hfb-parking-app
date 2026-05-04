export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, device_id } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  function generateCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'HFB-';

    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return result;
  }

  const code = generateCode();

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/discount_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        code: code,
        email: email,
        device_id: device_id,
        issued_at: new Date().toISOString(),
        redeemed: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        saved: false,
        error: data
      });
    }

    return res.status(200).json({
      code,
      saved: true
    });

  } catch (err) {
    return res.status(500).json({
      saved: false,
      error: err.message
    });
  }
}