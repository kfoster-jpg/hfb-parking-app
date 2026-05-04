export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

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
        issued_at: new Date().toISOString(),
        redeemed: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        code,
        saved: false,
        error: data
      });
    }

    return res.status(200).json({
      code,
      saved: true,
      supabase: data
    });

  } catch (err) {
    return res.status(500).json({
      code,
      saved: false,
      error: err.message
    });
  }
}