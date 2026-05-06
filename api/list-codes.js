import crypto from 'crypto';

function verifyStaffToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token || !token.includes('.')) {
    return null;
  }

  const [payloadBase64, signature] = token.split('.');
  const secret = process.env.STAFF_SESSION_SECRET;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  const payload = JSON.parse(
    Buffer.from(payloadBase64, 'base64url').toString()
  );

  if (!payload.expires_at || Date.now() > payload.expires_at) {
    return null;
  }

  return payload;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const staff = verifyStaffToken(req);

  if (!staff) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please log in again.'
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/discount_codes?select=id,code,email,issued_at,redeemed,redeemed_at,redeemed_by,unredeemed_at&order=issued_at.desc&limit=100`,
      {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({
        success: false,
        error: data
      });
    }

    return res.status(200).json({
      success: true,
      codes: data
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
}