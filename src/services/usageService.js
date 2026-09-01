// Usage Service - Aggregates token stats and spend metrics for a key

const prisma = require('../lib/prisma');

/**
 * Fetch and aggregate usage metrics for a specific virtual key.
 * @param {object} apiKey - Authenticated ApiKey record
 * @returns {Promise<object>}
 */
async function getUsageMetrics(apiKey) {
  const apiKeyId = apiKey.id;

  const totals = await prisma.usageLog.aggregate({
    where: { apiKeyId },
    _count: { id: true },
    _sum: {
      inputTokens: true,
      outputTokens: true,
      totalTokens: true,
      estimatedCost: true,
    },
  });

  const totalRequests = totals._count.id || 0;
  const inputTokens = totals._sum.inputTokens || 0;
  const outputTokens = totals._sum.outputTokens || 0;
  const totalTokens = totals._sum.totalTokens || 0;
  const totalEstimatedCost = totals._sum.estimatedCost || 0;

  return {
    budget: apiKey.budget,
    spent: apiKey.spent,
    remaining: Math.max(0, apiKey.budget - apiKey.spent),
    totalRequests,
    inputTokens,
    outputTokens,
    totalTokens,
    totalEstimatedCost,
  };
}

module.exports = {
  getUsageMetrics,
};
