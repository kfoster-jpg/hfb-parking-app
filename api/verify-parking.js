import crypto from 'crypto';

function createParkingToken() {
  const secret = process.env.PARKING_SESSION_SECRET;
  const expiresAt = Date.now() + 60 * 60 * 1000; // 60 minutes

  const payload = JSON.stringify({
    verified_parking: true,
    expires_at: expiresAt
  });

  const payloadBase64 = Buffer.from(payload).toString('base64url');

  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      message: 'Method not allowed.'
    });
  }

  const { distance_meters } = req.body;

  if (typeof distance_meters !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Distance is required.'
    });
  }

  // 0.2 miles = roughly 322 meters
  if (distance_meters > 322) {
    return res.status(403).json({
      success: false,
      message: 'This page can only be activated from the satellite parking area.'
    });
  }

  const parkingToken = createParkingToken();

  return res.status(200).json({
    success: true,
    parking_token: parkingToken,
    expires_in_minutes: 60
  });
}