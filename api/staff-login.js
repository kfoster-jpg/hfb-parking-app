import crypto from 'crypto';

function createStaffToken(staffName) {
  const secret = process.env.STAFF_SESSION_SECRET;
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000; // 12 hours

  const payload = JSON.stringify({
    staff_name: staffName,
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

  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      success: false,
      message: 'Password is required.'
    });
  }

  const staffUsers = {
    [process.env.STAFF_PASSWORD_1]: process.env.STAFF_NAME_1,
    [process.env.STAFF_PASSWORD_2]: process.env.STAFF_NAME_2,
    [process.env.STAFF_PASSWORD_3]: process.env.STAFF_NAME_3,
    [process.env.STAFF_PASSWORD_4]: process.env.STAFF_NAME_4
  };

  const staffName = staffUsers[password];

  if (!staffName) {
    return res.status(401).json({
      success: false,
      message: 'Incorrect password.'
    });
  }

  const staffToken = createStaffToken(staffName);

  return res.status(200).json({
    success: true,
    staff_name: staffName,
    staff_token: staffToken
  });
}