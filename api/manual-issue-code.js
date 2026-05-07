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

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let result = 'HFB-';

  for (let i = 0; i < 5; i++) {
    result += chars.charAt(
      Math.floor(Math.random() * chars.length)
    );
  }

  return result;
}

async function createAuditEvent({
  code,
  action,
  staffName,
  SUPABASE_URL,
  SUPABASE_KEY
}) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/code_events`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },

        body: JSON.stringify({
          code,
          action,
          staff_name: staffName
        })
      }
    );
  } catch (err) {
    console.error('Audit event failed:', err.message);
  }
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const staff =
    verifyStaffToken(req);

  if (!staff) {

    return res.status(401).json({
      success: false,
      message: 'Unauthorized. Please log in again.'
    });
  }

  if (req.method !== 'POST') {

    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  const SUPABASE_URL =
    process.env.SUPABASE_URL;

  const SUPABASE_KEY =
    process.env.SUPABASE_ANON_KEY;

  const {
    email,
    reason
  } = req.body;

  if (!email) {

    return res.status(400).json({
      success: false,
      message: 'Guest email is required.'
    });
  }

  const normalizedEmail =
    email.trim().toLowerCase();

  const manualReason =
    reason?.trim() || 'No reason provided';

  const staffName =
    staff.staff_name || 'Unknown Staff';

  const code =
    generateCode();

  try {

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/discount_codes`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation'
        },

        body: JSON.stringify({
          code: code,
          email: normalizedEmail,
          device_id: 'manual-issue',
          issued_at: new Date().toISOString(),
          redeemed: false,
          manual_issue_reason: manualReason
        })
      }
    );

    const data =
      await response.json();

    if (!response.ok) {

      return res.status(500).json({
        success: false,
        message: 'Could not manually issue code.',
        error: data
      });
    }

    await createAuditEvent({
      code,
      action: `manual_issue: ${manualReason}`,
      staffName,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(200).json({
      success: true,
      message: 'Manual code issued.',
      code: data[0]
    });

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: 'Server error.',
      error: err.message
    });
  }
}