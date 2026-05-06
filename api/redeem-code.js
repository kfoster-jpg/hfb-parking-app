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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  const { code, manager_name, action } = req.body;

  if (!code) {
    return res.status(400).json({
      success: false,
      message: 'Code is required.'
    });
  }

  const normalizedCode = code.trim().toUpperCase();

  const requestedAction = action || 'redeem';

  const managerName =
    staff.staff_name ||
    manager_name ||
    'Unknown Staff';

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

    if (!['redeem', 'unredeem'].includes(requestedAction)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action.'
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

    await createAuditEvent({
      code: normalizedCode,
      action: requestedAction,
      staffName: managerName,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(200).json({
      success: true,
      message:
        requestedAction === 'redeem'
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