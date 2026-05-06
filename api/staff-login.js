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

  return res.status(200).json({
    success: true,
    staff_name: staffName
  });
}