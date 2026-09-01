// Usage Controller - Handles HTTP requests for key usage analytics

const { getUsageMetrics } = require('../services/usageService');

/**
 * GET /api/usage
 * Protected by requireApiKey middleware
 */
async function getUsage(req, res, next) {
  try {
    const metrics = await getUsageMetrics(req.apiKey);
    return res.json(metrics);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getUsage,
};
