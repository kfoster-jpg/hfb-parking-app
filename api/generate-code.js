import crypto from 'crypto';

function getIpAddress(req) {
  const forwarded = req.headers['x-forwarded-for'];

  return typeof forwarded === 'string'
    ? forwarded.split(',')[0].trim()
    : req.socket?.remoteAddress || 'unknown';
}

function verifyParkingToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');

  if (!token || !token.includes('.')) {
    return null;
  }

  const [payloadBase64, signature] = token.split('.');
  const secret = process.env.PARKING_SESSION_SECRET;

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

  if (
    !payload.verified_parking ||
    !payload.expires_at ||
    Date.now() > payload.expires_at
  ) {
    return null;
  }

  return payload;
}

async function recordGuestAttempt({
  ipAddress,
  success,
  SUPABASE_URL,
  SUPABASE_KEY
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/guest_code_attempts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        ip_address: ipAddress,
        success
      })
    });
  } catch (err) {
    console.error('Guest request audit failed:', err.message);
  }
}

async function isGuestRateLimited({
  ipAddress,
  SUPABASE_URL,
  SUPABASE_KEY
}) {
  const fifteenMinutesAgo =
    new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/guest_code_attempts?ip_address=eq.${encodeURIComponent(ipAddress)}&attempted_at=gte.${encodeURIComponent(fifteenMinutesAgo)}&select=id`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    }
  );

  const data = await response.json();

  return data.length >= 20;
}

function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'HFB-';

  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
  const ipAddress = getIpAddress(req);

  if (req.method !== 'POST') {
    return res.status(405).json({
      allowed: false,
      saved: false,
      message: 'Method not allowed.'
    });
  }

  try {
    const limited = await isGuestRateLimited({
      ipAddress,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    if (limited) {
      return res.status(429).json({
        allowed: false,
        saved: false,
        message: 'Too many requests. Please wait a few minutes before trying again.'
      });
    }
  } catch (err) {
    return res.status(500).json({
      allowed: false,
      saved: false,
      message: 'Could not validate request limit.'
    });
  }

  const parking = verifyParkingToken(req);

  if (!parking) {
    await recordGuestAttempt({
      ipAddress,
      success: false,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(401).json({
      allowed: false,
      saved: false,
      message: 'Parking verification expired. Please scan again from the satellite parking area.'
    });
  }

  const { email, device_id } = req.body;

  if (!email) {
    await recordGuestAttempt({
      ipAddress,
      success: false,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(400).json({
      allowed: false,
      saved: false,
      message: 'Email is required.'
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

  try {
    const emailCheckUrl =
      `${SUPABASE_URL}/rest/v1/discount_codes?email=eq.${encodeURIComponent(normalizedEmail)}&issued_at=gte.${encodeURIComponent(twelveHoursAgo)}&select=id,code,email,issued_at`;

    const emailCheck = await fetch(emailCheckUrl, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    const emailMatches = await emailCheck.json();

    if (emailMatches.length > 0) {
      await recordGuestAttempt({
        ipAddress,
        success: false,
        SUPABASE_URL,
        SUPABASE_KEY
      });

      return res.status(429).json({
        allowed: false,
        reason: 'email_recently_used',
        message: 'This email has already received a code recently.'
      });
    }

    if (device_id) {
      const deviceCheckUrl =
        `${SUPABASE_URL}/rest/v1/discount_codes?device_id=eq.${encodeURIComponent(device_id)}&issued_at=gte.${encodeURIComponent(twelveHoursAgo)}&select=id,code,device_id,issued_at`;

      const deviceCheck = await fetch(deviceCheckUrl, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });

      const deviceMatches = await deviceCheck.json();

      if (deviceMatches.length > 0) {
        await recordGuestAttempt({
          ipAddress,
          success: false,
          SUPABASE_URL,
          SUPABASE_KEY
        });

        return res.status(429).json({
          allowed: false,
          reason: 'device_recently_used',
          message: 'This device has already received a code recently.'
        });
      }
    }

    const code = generateCode();

    const response = await fetch(`${SUPABASE_URL}/rest/v1/discount_codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        code,
        email: normalizedEmail,
        device_id,
        issued_at: new Date().toISOString(),
        redeemed: false
      })
    });

    const data = await response.json();

    if (!response.ok) {
      await recordGuestAttempt({
        ipAddress,
        success: false,
        SUPABASE_URL,
        SUPABASE_KEY
      });

      return res.status(500).json({
        allowed: false,
        saved: false,
        error: data
      });
    }

    await recordGuestAttempt({
      ipAddress,
      success: true,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(200).json({
      allowed: true,
      code,
      saved: true
    });

  } catch (err) {
    await recordGuestAttempt({
      ipAddress,
      success: false,
      SUPABASE_URL,
      SUPABASE_KEY
    });

    return res.status(500).json({
      allowed: false,
      saved: false,
      error: err.message
    });
  }
}