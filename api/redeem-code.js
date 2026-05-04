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

  const { code } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Code is required.'
    });
  }

  const normalizedCode = code.trim().toUpperCase();

  try {
    const checkResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/discount_codes?code=eq.${encodeURIComponent(normalizedCode)}&select=*`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const matches = await checkResponse.json();

    if (!matches || matches.length === 0) {
      return res.status(404).json({
        success: false,
        status: 'not_found',
        message: 'Code not found.'
      });
    }

    const existingCode = matches[0];

    if (existingCode.redeemed === true) {
      return res.status(409).json({
        success: false,
        status: 'already_redeemed',
        message: 'This code has already been redeemed.',
        code: existingCode.code,
        redeemed_at: existingCode.redeemed_at
      });
    }

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/discount_codes?id=eq.${existingCode.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          redeemed: true,
          redeemed_at: new Date().toISOString()
        })
      }
    );

    const updated = await updateResponse.json();

    if (!updateResponse.ok) {
      return res.status(500).json({
        success: false,
        message: 'Could not redeem code.',
        error: updated
      });
    }

    return res.status(200).json({
      success: true,
      status: 'redeemed',
      message: 'Code redeemed successfully.',
      code: updated[0].code,
      redeemed_at: updated[0].redeemed_at
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error.',
      error: err.message
    });
  }
}