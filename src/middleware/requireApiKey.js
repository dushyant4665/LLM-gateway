const prisma = require('../lib/prisma');

// Reads the gateway API key from the Authorization header,
// looks it up in the database, and attaches the record to req.apiKey.
async function requireApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const key = authHeader.slice(7).trim();

  try {
    const apiKey = await prisma.apiKey.findUnique({ where: { key } });

    if (!apiKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.apiKey = apiKey; // available to downstream handlers
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal database error during authentication' });
  }
}

module.exports = requireApiKey;
