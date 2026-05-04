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

  const { code, manager_name, action } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Code is required.'
    });
  }

  if (!manager_name) {
    return res.status(400).json({
      success: false,
      message: 'Manager name is required.'
    });
  }

  const normalizedCode = code.trim().toUpperCase();
  const managerName = manager_name.trim();
  const requestedAction = action || 'redeem';

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
        message: 'Code not found.'
      });
    }

    const existingCode = matches[0];

    let updateBody = {};

    if (requestedAction === 'redeem') {
      if (existingCode.redeemed === true) {
        return res.status(409).json({
          success: false,
          message: 'This code has already been redeemed.'
        });
      }

      updateBody = {
        redeemed: true,
        redeemed_at: new Date().toISOString(),
        redeemed_by: managerName
      };
    }

    if (requestedAction === 'unredeem') {
      if (existingCode.redeemed !== true) {
        return res.status(409).json({
          success: false,
          message: 'This code is already marked unredeemed.'
        });
      }

      updateBody = {
        redeemed: false,
        redeemed_at: null,
        redeemed_by: null,
        unredeemed_at: new Date().toISOString()
      };
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
        body: JSON.stringify(updateBody)
      }
    );

    const updated = await updateResponse.json();

    if (!updateResponse.ok) {
      return res.status(500).json({
        success: false,
        message: 'Could not update code.',
        error: updated
      });
    }

    return res.status(200).json({
      success: true,
      message: requestedAction === 'redeem'
        ? 'Code redeemed successfully.'
        : 'Code marked unredeemed.',
      code: updated[0]
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Server error.',
      error: err.message
    });
  }
}