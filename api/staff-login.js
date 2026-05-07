import crypto from 'crypto';

function createStaffToken(staffName) {
  const secret = process.env.STAFF_SESSION_SECRET;

  const expiresAt =
    Date.now() + 12 * 60 * 60 * 1000;

  const payload = JSON.stringify({
    staff_name: staffName,
    expires_at: expiresAt
  });

  const payloadBase64 =
    Buffer.from(payload).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

async function recordLoginAttempt({
  ipAddress,
  success,
  SUPABASE_URL,
  SUPABASE_KEY
}) {
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/login_attempts`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        },

        body: JSON.stringify({
          ip_address: ipAddress,
          success: success
        })
      }
    );
  } catch (err) {
    console.error('Login audit failed:', err.message);
  }
}

async function isRateLimited({
  ipAddress,
  SUPABASE_URL,
  SUPABASE_KEY
}) {
  const fifteenMinutesAgo =
    new Date(
      Date.now() - 15 * 60 * 1000
    ).toISOString();

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/login_attempts?ip_address=eq.${encodeURIComponent(ipAddress)}&attempted_at=gte.${encodeURIComponent(fifteenMinutesAgo)}&success=eq.false&select=id`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const data = await response.json();

  return data.length >= 10;
}

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL =
    process.env.SUPABASE_URL;

  const SUPABASE_KEY =
    process.env.SUPABASE_ANON_KEY;

  const forwarded =
    req.headers['x-forwarded-for'];

  const ipAddress =
    typeof forwarded === 'string'
      ? forwarded.split(',')[0].trim()
      : req.socket?.remoteAddress || 'unknown';

  try {

    const limited = await isRateLimited({
      ipAddress,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    if (limited) {

      return res.status(429).json({
        success: false,
        message:
          'Too many login attempts. Please wait 15 minutes.'
      });
    }

  } catch (err) {

    return res.status(500).json({
      success: false,
      message: 'Could not validate login rate limit.'
    });
  }

  if (req.method !== 'POST') {

    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  const { password } = req.body;

  if (!password) {

    return res.status(400).json({
      success: false,
      message: 'Password is required.'
    });
  }

  const staffUsers = {
    [process.env.STAFF_PASSWORD_1]:
      process.env.STAFF_NAME_1,

    [process.env.STAFF_PASSWORD_2]:
      process.env.STAFF_NAME_2,

    [process.env.STAFF_PASSWORD_3]:
      process.env.STAFF_NAME_3,

    [process.env.STAFF_PASSWORD_4]:
      process.env.STAFF_NAME_4
  };

  const staffName =
    staffUsers[password];

  if (!staffName) {

    await recordLoginAttempt({
      ipAddress,
      success: false,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(401).json({
      success: false,
      message: 'Incorrect password.'
    });
  }

  await recordLoginAttempt({
    ipAddress,
    success: true,
    SUPABASE_URL,
    SUPABASE_KEY
  });

  const staffToken =
    createStaffToken(staffName);

  return res.status(200).json({
    success: true,
    staff_name: staffName,
    staff_token: staffToken
  });
}