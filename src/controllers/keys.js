// Keys Controller - Handles HTTP requests for virtual key generation

const { generateApiKey } = require('../services/keyService');

/**
 * POST /api/keys
 * Request body: { budget: number }
 */
async function createKey(req, res, next) {
  try {
    const { budget } = req.body;

    if (budget === undefined || budget === null) {
      return res.status(400).json({ error: 'budget is required' });
    }

    const budgetNum = Number(budget);
    if (isNaN(budgetNum) || budgetNum <= 0) {
      return res.status(400).json({ error: 'budget must be a positive number' });
    }

    const keyData = await generateApiKey(budgetNum);
    return res.status(201).json(keyData);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createKey,
};
