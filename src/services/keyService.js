// Key Service - Business logic for Virtual API Key generation and management

const crypto = require('crypto');
const prisma = require('../lib/prisma');

/**
 * Generate a cryptographically secure virtual API key with an assigned budget.
 * @param {number} budget - Maximum allowed USD spend.
 * @returns {Promise<{ key: string, budget: number }>}
 */
async function generateApiKey(budget) {
  const budgetNum = Number(budget);
  if (isNaN(budgetNum) || budgetNum <= 0) {
    const err = new Error('budget must be a positive number');
    err.statusCode = 400;
    throw err;
  }

  // Prefix rk_live_ with 32-char hex string
  const rawKey = 'rk_live_' + crypto.randomBytes(16).toString('hex');

  const apiKey = await prisma.apiKey.create({
    data: {
      key: rawKey,
      budget: budgetNum,
    },
  });

  return {
    key: apiKey.key,
    budget: apiKey.budget,
  };
}

module.exports = {
  generateApiKey,
};
